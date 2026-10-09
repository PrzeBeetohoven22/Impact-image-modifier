import { describe, it, expect, vi } from "vitest";
import { CanvaService, type Tokens, type Transport } from "../src/server/canva";
import { gradientFixture } from "./fixtures";
const settings = {
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "http://127.0.0.1:3001/api/canva/callback",
  templateId: "template",
  imageField: "SPEAKER",
};
const tokens: Tokens = {
  access_token: "test-token",
  refresh_token: "test-refresh",
  expires_at: Date.now() + 3600_000,
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("Canva provider using official stable brand-template endpoints", () => {
  it("creates a PKCE challenge and state while keeping the client secret out of the URL", () => {
    const auth = new CanvaService(settings).authorization(),
      u = new URL(auth.url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.verifier.length).toBeGreaterThan(43);
    expect(u.searchParams.get("state")).toBe(auth.state);
    expect(auth.url).not.toContain("test-secret");
  });
  it("checks dataset, uploads separate alpha layer, polls autofill, retains edit link, exports PNG", async () => {
    const png = await gradientFixture();
    const calls: { url: string; init?: RequestInit }[] = [];
    const transport: Transport = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/dataset"))
        return reply({ dataset: { SPEAKER: { type: "image" } } });
      if (url.endsWith("/asset-uploads"))
        return reply({ job: { id: "upload", status: "in_progress" } });
      if (url.endsWith("/asset-uploads/upload"))
        return reply({
          job: { id: "upload", status: "success", asset: { id: "asset" } },
        });
      if (url.endsWith("/autofills"))
        return reply({
          job: {
            id: "fill",
            status: "success",
            result: {
              design: {
                id: "design",
                urls: { edit_url: "https://www.canva.com/design/design/edit" },
              },
            },
          },
        });
      if (url.endsWith("/exports"))
        return reply({
          job: {
            id: "export",
            status: "success",
            urls: ["https://export-download.canva.com/image.png"],
          },
        });
      return new Response(new Uint8Array(png));
    };
    const service = new CanvaService(settings, transport, async () => {}),
      onExport = vi.fn();
    const r = await service.create(
      Buffer.from("alpha-layer"),
      "Test speaker",
      tokens,
      onExport,
    );
    expect(r.id).toBe("design");
    expect(r.editUrl).toContain("/edit");
    expect(onExport).toHaveBeenCalledOnce();
    expect(
      calls.find((c) => c.url.endsWith("/asset-uploads"))?.init?.body,
    ).toEqual(Buffer.from("alpha-layer"));
    const autofill = JSON.parse(
      calls.find((c) => c.url.endsWith("/autofills"))!.init!.body as string,
    );
    expect(autofill.type).toBe("create_from_brand_template");
    expect(autofill.data.SPEAKER.asset_id).toBe("asset");
    expect(calls.find((c) => c.url.endsWith("/exports"))!.init!.body).toContain(
      "1600",
    );
  });
  it.each([
    [401, "CANVA_AUTHORIZATION_FAILED"],
    [403, "CANVA_ACCESS_DENIED"],
    [404, "CANVA_TEMPLATE_UNAVAILABLE"],
    [429, "CANVA_RATE_LIMIT"],
    [500, "CANVA_POPULATION_FAILED"],
  ])(
    "reports HTTP %s without leaking server payloads",
    async (status, code) => {
      const service = new CanvaService(settings, async () =>
        reply({ secret: "do not expose" }, Number(status)),
      );
      await expect(
        service.create(Buffer.alloc(0), "speaker", tokens, () => {}),
      ).rejects.toMatchObject({ code });
    },
  );
  it("rejects wrong field types before creating an asset", async () => {
    const service = new CanvaService(settings, async () =>
      reply({ dataset: { SPEAKER: { type: "text" } } }),
    );
    await expect(
      service.create(Buffer.alloc(0), "speaker", tokens, () => {}),
    ).rejects.toMatchObject({ code: "CANVA_TEMPLATE_FIELD" });
  });
  it("preserves the design reference on export failure and allows a retry without duplication", async () => {
    const png = await gradientFixture();
    let requests = 0;
    const service = new CanvaService(
      settings,
      async (url) => {
        requests++;
        if (url.endsWith("/exports"))
          return reply({
            job: {
              id: "export",
              status: "failed",
              error: { code: "export_failed" },
            },
          });
        return new Response(new Uint8Array(png));
      },
      async () => {},
    );
    const existing = {
      id: "existing",
      editUrl: "https://www.canva.com/design/existing/edit",
    };
    await expect(
      service.create(Buffer.alloc(0), "speaker", tokens, () => {}, existing),
    ).rejects.toMatchObject({ code: "CANVA_EXPORT_FAILED" });
    expect(service.lastDesign).toEqual(existing);
    expect(requests).toBe(1);
  });
  it("validates dimensions rather than resizing a wrong Canva export", async () => {
    const service = new CanvaService(
      settings,
      async (url) =>
        url.endsWith("/exports")
          ? reply({
              job: {
                id: "export",
                status: "success",
                urls: ["https://export-download.canva.com/wrong.png"],
              },
            })
          : new Response(
              new Uint8Array(
                await import("sharp").then(async ({ default: sharp }) =>
                  sharp({
                    create: {
                      width: 1600,
                      height: 900,
                      channels: 3,
                      background: "#fff",
                    },
                  })
                    .png()
                    .toBuffer(),
                ),
              ),
            ),
      async () => {},
    );
    await expect(
      service.create(Buffer.alloc(0), "speaker", tokens, () => {}, {
        id: "design",
        editUrl: "https://www.canva.com/design/design/edit",
      }),
    ).rejects.toMatchObject({ code: "CANVA_DIMENSIONS" });
  });
  it("bounds polling and rejects unrelated export download hosts", async () => {
    const service = new CanvaService(
      settings,
      async () =>
        reply({
          job: {
            id: "export",
            status: "success",
            urls: ["http://127.0.0.1/private"],
          },
        }),
      async () => {},
    );
    await expect(
      service.create(Buffer.alloc(0), "speaker", tokens, () => {}, {
        id: "design",
        editUrl: "https://www.canva.com/design/design/edit",
      }),
    ).rejects.toMatchObject({ code: "CANVA_EXPORT_URL" });
  });
});

it("sends a proxy-managed Basic credential directly without encoding its placeholder", async () => {
  const transport = vi.fn<Transport>(async () =>
    reply({
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
    }),
  );
  const service = new CanvaService(
    {
      ...settings,
      clientSecret: undefined,
      basicAuth: "proxy-managed-placeholder",
    },
    transport,
  );
  await service.exchange("code", "verifier");
  const init = transport.mock.calls[0]?.[1] as RequestInit | undefined;
  expect(init?.headers).toMatchObject({
    Authorization: "Basic proxy-managed-placeholder",
  });
});
