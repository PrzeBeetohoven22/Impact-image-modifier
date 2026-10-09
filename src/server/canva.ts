import { randomBytes, createHash } from "node:crypto";
import { fetch as proxyFetch, EnvHttpProxyAgent } from "undici";
import sharp from "sharp";
import { AppError } from "./errors.js";
import { validateExport } from "./images.js";
// Server-side requests support the environment's HTTPS proxy, including injected credentials.
const dispatcher = new EnvHttpProxyAgent();
export type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export type CanvaSettings = {
  clientId?: string;
  clientSecret?: string;
  basicAuth?: string;
  redirectUri?: string;
  templateId?: string;
  imageField?: string;
};
export type CanvaResult = { id: string; editUrl: string; png: Buffer };
export interface CanvaProvider {
  create(
    layer: Buffer,
    title: string,
    tokens: Tokens,
    onExport: () => void,
    existing?: { id: string; editUrl: string },
  ): Promise<CanvaResult>;
}
type ApiJob = {
  id: string;
  status: "in_progress" | "success" | "failed";
  error?: { code: string };
  asset?: { id: string };
  result?: { design: { id: string; urls: { edit_url: string } } };
  urls?: string[];
};
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;
const defaultTransport: Transport = async (url, init) =>
  proxyFetch(url, { ...init, dispatcher } as Parameters<
    typeof proxyFetch
  >[1]) as unknown as Response;
export class CanvaService implements CanvaProvider {
  constructor(
    public settings: CanvaSettings,
    private transport: Transport = defaultTransport,
    private pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  configured() {
    return Boolean(
      this.settings.clientId &&
      (this.settings.basicAuth || this.settings.clientSecret) &&
      this.settings.redirectUri &&
      this.settings.templateId &&
      this.settings.imageField,
    );
  }
  authorization() {
    if (
      !this.settings.clientId ||
      (!this.settings.clientSecret && !this.settings.basicAuth) ||
      !this.settings.redirectUri
    )
      throw new AppError(
        "CANVA_NOT_CONFIGURED",
        "Skonfiguruj integrację Canva Connect i adres powrotu w ustawieniach serwera.",
        503,
      );
    const verifier = randomBytes(48).toString("base64url"),
      state = randomBytes(32).toString("base64url");
    const url = new URL("https://www.canva.com/api/oauth/authorize");
    for (const [k, v] of Object.entries({
      client_id: this.settings.clientId,
      response_type: "code",
      redirect_uri: this.settings.redirectUri,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      scope:
        "asset:read asset:write brandtemplate:content:read brandtemplate:meta:read design:content:read design:content:write design:meta:read",
    }))
      url.searchParams.set(k, v);
    return { url: url.toString(), state, verifier };
  }
  async exchange(code: string, verifier: string) {
    return this.token({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: this.settings.redirectUri!,
    });
  }
  async refresh(tokens: Tokens) {
    if (tokens.expires_at > Date.now() + 60_000) return tokens;
    return this.token({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
  }
  private async token(data: Record<string, string>): Promise<Tokens> {
    const r = await this.transport(
      "https://api.canva.com/rest/v1/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.settings.basicAuth ?? Buffer.from(`${this.settings.clientId}:${this.settings.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!r.ok)
      throw new AppError(
        "CANVA_AUTHORIZATION_FAILED",
        "Autoryzacja Canva nie powiodła się. Połącz konto ponownie i sprawdź ustawienia integracji.",
        401,
      );
    const value = (await r.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    if (!value.access_token || !value.refresh_token || !value.expires_in)
      throw new AppError(
        "CANVA_AUTHORIZATION_FAILED",
        "Canva zwróciła niepełną odpowiedź autoryzacji.",
        502,
      );
    return { ...value, expires_at: Date.now() + value.expires_in * 1000 };
  }
  private async request<T>(
    path: string,
    tokens: Tokens,
    method = "GET",
    body?: string | Buffer,
    extra: Record<string, string> = {},
    code = "CANVA_POPULATION_FAILED",
  ): Promise<T> {
    let r: Response;
    try {
      r = await this.transport(`https://api.canva.com/rest/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          ...(typeof body === "string"
            ? { "Content-Type": "application/json" }
            : {}),
          ...extra,
        },
        body: body as BodyInit | undefined,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new AppError(
        "CANVA_NETWORK",
        "Nie można połączyć się z Canva. Sprawdź dostęp sieciowy serwera.",
        503,
      );
    }
    if (r.status === 401)
      throw new AppError(
        "CANVA_AUTHORIZATION_FAILED",
        "Sesja Canva wygasła. Połącz konto ponownie.",
        401,
      );
    if (r.status === 403)
      throw new AppError(
        "CANVA_ACCESS_DENIED",
        "Canva odmówiła dostępu. Sprawdź zakresy OAuth i uprawnienie do Autofill (Enterprise lub aktywny dostęp próbny).",
        403,
      );
    if (r.status === 404)
      throw new AppError(
        "CANVA_TEMPLATE_UNAVAILABLE",
        "Nie znaleziono szablonu lub projektu. Sprawdź jego identyfikator i uprawnienia.",
        404,
      );
    if (r.status === 429)
      throw new AppError(
        "CANVA_RATE_LIMIT",
        "Canva ograniczyła liczbę żądań. Spróbuj za chwilę.",
        429,
      );
    if (!r.ok)
      throw new AppError(
        code,
        "Canva nie wykonała operacji. Sprawdź szablon i spróbuj ponownie.",
        502,
      );
    return r.json() as Promise<T>;
  }
  private async poll(path: string, job: ApiJob, tokens: Tokens, code: string) {
    for (let i = 0; i < 90; i++) {
      if (job.status === "success") return job;
      if (job.status === "failed")
        throw new AppError(
          code,
          `Operacja Canva nie powiodła się (${job.error?.code ?? "unknown"}). Sprawdź ustawienia i spróbuj ponownie.`,
          502,
        );
      await this.pause(1000);
      job = (
        await this.request<{ job: ApiJob }>(
          `${path}/${encodeURIComponent(job.id)}`,
          tokens,
        )
      ).job;
    }
    throw new AppError(
      "CANVA_TIMEOUT",
      "Canva nadal przetwarza żądanie. Spróbuj ponownie później.",
      504,
    );
  }
  async create(
    layer: Buffer,
    title: string,
    tokens: Tokens,
    onExport: () => void,
    existing?: { id: string; editUrl: string },
  ): Promise<CanvaResult> {
    if (!this.configured())
      throw new AppError(
        "CANVA_NOT_CONFIGURED",
        "Brakuje konfiguracji Canva Connect lub szablonu marki.",
        503,
      );
    let design = existing;
    if (!design) {
      const dataset = await this.request<{
        dataset: Record<string, { type: string }>;
      }>(
        `/brand-templates/${encodeURIComponent(this.settings.templateId!)}/dataset`,
        tokens,
      );
      if (dataset.dataset[this.settings.imageField!]?.type !== "image")
        throw new AppError(
          "CANVA_TEMPLATE_FIELD",
          "Szablon nie zawiera wskazanego pola obrazu. Ustaw pole pełnoekranowej sylwetki PNG.",
          400,
        );
      const up = await this.request<{ job: ApiJob }>(
        "/asset-uploads",
        tokens,
        "POST",
        layer,
        {
          "Content-Type": "application/octet-stream",
          "Asset-Upload-Metadata": JSON.stringify({
            name_base64: Buffer.from(title.slice(0, 50)).toString("base64"),
          }),
        },
      );
      const uploaded = await this.poll(
        "/asset-uploads",
        up.job,
        tokens,
        "CANVA_ASSET_FAILED",
      );
      if (!uploaded.asset?.id)
        throw new AppError(
          "CANVA_ASSET_FAILED",
          "Canva nie zwróciła identyfikatora wgranego obrazu.",
          502,
        );
      const fill = await this.request<{ job: ApiJob }>(
        "/autofills",
        tokens,
        "POST",
        JSON.stringify({
          type: "create_from_brand_template",
          brand_template_id: this.settings.templateId,
          title,
          data: {
            [this.settings.imageField!]: {
              type: "image",
              asset_id: uploaded.asset.id,
            },
          },
        }),
      );
      const completed = await this.poll(
        "/autofills",
        fill.job,
        tokens,
        "CANVA_POPULATION_FAILED",
      );
      const d = completed.result?.design;
      if (!d?.urls.edit_url)
        throw new AppError(
          "CANVA_POPULATION_FAILED",
          "Canva nie zwróciła adresu edytowalnego projektu.",
          502,
        );
      const edit = new URL(d.urls.edit_url);
      if (
        edit.protocol !== "https:" ||
        !(edit.hostname === "canva.com" || edit.hostname.endsWith(".canva.com"))
      )
        throw new AppError(
          "CANVA_POPULATION_FAILED",
          "Canva zwróciła nieoczekiwany adres edycji.",
          502,
        );
      design = { id: d.id, editUrl: d.urls.edit_url };
    }
    // Retain the editable design on export failure so retry does not duplicate it.
    this.lastDesign = design;
    onExport();
    const exportJob = await this.request<{ job: ApiJob }>(
      "/exports",
      tokens,
      "POST",
      JSON.stringify({
        design_id: design.id,
        format: {
          type: "png",
          width: 1600,
          height: 1200,
          lossless: true,
          transparent_background: false,
          pages: [1],
        },
      }),
      {},
      "CANVA_EXPORT_FAILED",
    );
    const exported = await this.poll(
      "/exports",
      exportJob.job,
      tokens,
      "CANVA_EXPORT_FAILED",
    );
    if (exported.urls?.length !== 1)
      throw new AppError(
        "CANVA_EXPORT_FAILED",
        "Canva nie zwróciła pojedynczego obrazu PNG.",
        502,
      );
    const url = new URL(exported.urls[0]);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "canva.com" ||
        url.hostname.endsWith(".canva.com") ||
        url.hostname.endsWith(".canva.cn")
      )
    )
      throw new AppError(
        "CANVA_EXPORT_URL",
        "Canva zwróciła nieoczekiwany adres pobierania.",
        502,
      );
    const download = await this.transport(url.toString(), {
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!download.ok)
      throw new AppError(
        "CANVA_EXPORT_FAILED",
        "Nie udało się pobrać eksportu Canva.",
        502,
      );
    if (!download.body)
      throw new AppError(
        "CANVA_EXPORT_FAILED",
        "Canva zwróciła pusty eksport.",
        502,
      );
    const reader = download.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 30 * 1024 * 1024) {
        await reader.cancel();
        throw new AppError(
          "CANVA_EXPORT_FAILED",
          "Eksport Canva jest zbyt duży.",
          502,
        );
      }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks);
    // Verify Canva's dimensions before normalizing color/metadata. Never mask a wrong template size.
    const m = await sharp(bytes, { limitInputPixels: 1600 * 1200 }).metadata();
    if (m.format !== "png" || m.width !== 1600 || m.height !== 1200)
      throw new AppError(
        "CANVA_DIMENSIONS",
        "Szablon Canva musi mieć proporcje 4:3 i eksport 1600 × 1200 px.",
        502,
      );
    const png = await sharp(bytes)
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .withIccProfile("srgb")
      .png()
      .toBuffer();
    await validateExport(png);
    return { ...design, png };
  }
  // Each session owns its CanvaService instance. This contains URLs only, never tokens.
  lastDesign?: { id: string; editUrl: string };
}
