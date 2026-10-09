import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import type { Analysis, JobView, RenderSettings } from "../shared/config.js";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_FRAMING,
  IMPACT_PRESET,
  OUTPUT_FILENAME,
  renderSchema,
  gradientModeSchema,
} from "../shared/config.js";
import {
  normalizeUpload,
  compose,
  MAX_UPLOAD,
  prepareGradient,
  measureHead,
} from "./images.js";
import { AppError, publicError } from "./errors.js";
import {
  LocalBackgroundRemoval,
  LocalSubjectAnalysis,
  TransparentPngProvider,
  hasTransparentBackground,
  type BackgroundRemovalProvider,
  type SubjectAnalysisProvider,
} from "./providers.js";
import { CanvaService, type CanvaSettings, type Tokens } from "./canva.js";
import {
  LocalObjectDetection,
  type ObjectDetectionProvider,
} from "./objects.js";
export type AppOptions = {
  analysis?: SubjectAnalysisProvider;
  background?: BackgroundRemovalProvider;
  objects?: ObjectDetectionProvider;
  canva?: CanvaSettings;
  modelBase?: string;
  sessionKey?: string;
  // A validated, opaque 1600 × 1200 background loaded once at startup.
  defaultGradient?: Buffer;
};
type Job = {
  view: JobView;
  source?: Buffer;
  subject?: Buffer;
  background: Buffer;
  png?: Buffer;
  layer?: Buffer;
  analysis?: Analysis;
  settings: RenderSettings;
  busy: boolean;
  cancelled: boolean;
  reviewed: boolean;
  mode: "auto" | "transparent";
};
type Session = {
  jobs: Map<string, Job>;
  gradient?: Buffer;
  gradientSource?: "default" | "uploaded";
  updated: number;
  tokens?: Tokens;
  oauth?: { state: string; verifier: string; created: number };
  canva: CanvaService;
};
function isCodespacesProxyOrigin(req: Request, enabled: boolean, port: string) {
  // Codespaces can rewrite Origin to the local upstream. Sec-Fetch-Site is
  // supplied by the browser and cannot be set by page JavaScript. Accept this
  // rewrite only for same-origin browser requests to this server's loopback port.
  if (
    !enabled ||
    req.headers["sec-fetch-site"] !== "same-origin" ||
    !req.headers.origin
  )
    return false;
  try {
    const origin = new URL(req.headers.origin);
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
      origin.port === port &&
      origin.origin === req.headers.origin
    );
  } catch {
    return false;
  }
}
export function createApp(options: AppOptions = {}) {
  const app = express(),
    sessions = new Map<string, Session>();
  const publicOrigin = process.env.APP_ORIGIN,
    isCodespaces =
      process.env.CODESPACES === "true" && Boolean(process.env.CODESPACE_NAME),
    serverPort = String(Number(process.env.PORT ?? 3001));
  const analysis =
    options.analysis ??
    new LocalSubjectAnalysis(
      options.modelBase ?? "http://127.0.0.1:3001/internal-models/",
    );
  const background = options.background ?? new LocalBackgroundRemoval(),
    transparent = new TransparentPngProvider();
  const objects = options.objects ?? new LocalObjectDetection();
  const ttl = 20 * 60 * 1000;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD, files: 1, fields: 3, fieldSize: 500 },
    fileFilter: (_req, file, cb) =>
      cb(
        null,
        ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype),
      ),
  });
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "blob:", "data:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cookieParser(options.sessionKey ?? randomBytes(32).toString("hex")));
  app.use(express.json({ limit: "20kb" }));
  // Only trusted model weights bundled with npm are exposed here. No uploads are served from disk.
  app.use(
    "/internal-models",
    express.static(resolve("node_modules/@vladmandic/human/models")),
  );
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      const allowed = publicOrigin ?? `http://${req.headers.host}`,
        site = req.headers["sec-fetch-site"],
        origin = req.headers.origin;
      if (
        (site && site !== "same-origin" && site !== "none") ||
        (origin &&
          origin !== allowed &&
          !isCodespacesProxyOrigin(req, isCodespaces, serverPort))
      )
        return next(
          new AppError(
            "ORIGIN_REJECTED",
            "Żądanie z niedozwolonej strony.",
            403,
          ),
        );
    }
    let id = req.signedCookies.impact_session as string | undefined;
    if (!id || !sessions.has(id)) {
      if (sessions.size >= 50)
        return next(
          new AppError(
            "SERVER_BUSY",
            "Serwer jest zajęty. Spróbuj później.",
            503,
          ),
        );
      id = randomUUID();
      sessions.set(id, {
        jobs: new Map(),
        gradient: options.defaultGradient,
        gradientSource: options.defaultGradient ? "default" : undefined,
        updated: Date.now(),
        canva: new CanvaService(options.canva ?? {}),
      });
      res.cookie("impact_session", id, {
        signed: true,
        httpOnly: true,
        sameSite: "lax",
        secure: publicOrigin?.startsWith("https:") ?? false,
        maxAge: ttl,
        path: "/",
      });
    }
    res.locals.session = sessions.get(id)!;
    res.locals.session.updated = Date.now();
    next();
  });
  let active = 0;
  let chain = Promise.resolve();
  function queue(task: () => Promise<void>) {
    active++;
    const next = chain.then(task).finally(() => {
      active--;
    });
    chain = next.catch(() => {});
    return next;
  }
  const cleanup = setInterval(() => {
    for (const [id, s] of sessions) {
      for (const [jid, j] of s.jobs)
        if (j.view.expiresAt < Date.now()) {
          j.cancelled = true;
          s.jobs.delete(jid);
        }
      if (s.updated + ttl < Date.now()) {
        for (const j of s.jobs.values()) j.cancelled = true;
        sessions.delete(id);
      }
    }
  }, 30_000);
  cleanup.unref();
  function session(res: Response): Session {
    return res.locals.session;
  }
  function job(req: Request, res: Response) {
    const j = session(res).jobs.get(String(req.params.id));
    if (!j || j.cancelled || j.view.expiresAt < Date.now())
      throw new AppError(
        "JOB_EXPIRED",
        "Zdjęcie wygasło lub zostało usunięte. Wgraj je ponownie.",
        404,
      );
    return j;
  }
  async function render(j: Job) {
    if (!j.subject || !j.analysis)
      throw new AppError(
        "NOT_READY",
        "Poczekaj na zakończenie przetwarzania.",
        409,
      );
    j.view.state = "composing";
    const r = await compose(
      j.subject,
      j.background,
      j.settings.composition,
      j.settings.framing,
      j.settings.filters,
      j.analysis,
      j.view.head,
    );
    if (j.cancelled) return;
    j.png = r.png;
    j.layer = r.layer;
    j.view.hasPreview = true;
    j.view.revision++;
    j.view.layout = r.layout;
    j.view.error = undefined;
    j.view.warnings = [...j.analysis.warnings, ...r.warnings];
    j.view.state = "complete";
    j.view.canvaDesign = undefined;
    j.view.canvaError = undefined;
    j.view.canvaState = "unconfigured";
  }
  async function processJob(j: Job) {
    j.busy = true;
    try {
      if (!j.source || j.cancelled) return;
      if (!j.analysis) {
        j.view.state = "validating";
        j.analysis = await analysis.analyze(j.source);
        j.view.analysis = j.analysis;
      }
      if (j.cancelled) return;
      if (j.analysis.people > 1) {
        j.view.state = "failed";
        j.view.error = {
          code: "MULTIPLE_PEOPLE",
          message:
            "Wykryto kilka osób. Wgraj zdjęcie z jednym prelegentem lub wykadruj je przed wysłaniem.",
        };
        return;
      }
      j.view.state = "removing-background";
      j.subject = await (
        j.mode === "transparent" ? transparent : background
      ).remove(j.source);
      j.view.hasSubject = true;
      j.view.head = await measureHead(j.subject, j.analysis);
      j.source = undefined;
      if (j.cancelled) return;
      j.view.state = "detecting-objects";
      j.view.objectReport = await objects.detect(
        j.subject,
        j.analysis.objects ?? [],
      );
      j.view.objectDecision = "pending";
      if (j.cancelled) return;
      j.view.error = undefined;
      await render(j);
    } catch (e) {
      if (!j.cancelled) {
        j.view.state = j.subject ? "manual-review-required" : "failed";
        j.view.error = publicError(e);
        j.source = undefined;
      }
    } finally {
      j.busy = false;
    }
  }
  app.get("/api/status", (_req, res) => {
    const s = session(res);
    res.json({
      output: { width: 1600, height: 1200 },
      hasGradient: Boolean(s.gradient),
      gradientSource: s.gradientSource ?? null,
      canvaConfigured: s.canva.configured(),
      canvaConnected: Boolean(s.tokens),
      retentionMinutes: 20,
      preset: IMPACT_PRESET,
      composition: DEFAULT_COMPOSITION,
    });
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/gradient", upload.single("gradient"), async (req, res) => {
    if (options.defaultGradient)
      throw new AppError(
        "BACKGROUND_LOCKED",
        "Tło marki ma stały gradient i pozycję. Nie można go zmienić.",
        409,
      );
    if (!req.file)
      throw new AppError(
        "UNSUPPORTED_TYPE",
        "Wybierz zatwierdzone tło PNG, JPEG lub WebP 1600 × 1200.",
      );
    const mode = gradientModeSchema.parse(req.body.mode ?? "canvas");
    session(res).gradient = await prepareGradient(
      req.file.buffer,
      req.file.mimetype,
      mode,
    );
    session(res).gradientSource = "uploaded";
    res.json({ ok: true });
  });
  app.get("/api/gradient/preview", (_req, res) => {
    const gradient = session(res).gradient;
    if (!gradient)
      throw new AppError("GRADIENT_REQUIRED", "Najpierw wgraj tło.", 404);
    res.type("png").send(gradient);
  });
  app.post("/api/jobs", upload.single("photo"), async (req, res) => {
    const s = session(res);
    if (active >= 3 || s.jobs.size >= 5)
      throw new AppError(
        "SERVER_BUSY",
        "Limit przetwarzania został osiągnięty. Usuń poprzednie zdjęcia lub poczekaj.",
        429,
      );
    if (!s.gradient)
      throw new AppError(
        "GRADIENT_REQUIRED",
        "Najpierw wgraj zatwierdzone tło 1600 × 1200 px.",
      );
    if (!req.file)
      throw new AppError(
        "UNSUPPORTED_TYPE",
        "Wybierz zdjęcie JPEG, PNG lub WebP.",
      );
    const source = await normalizeUpload(req.file.buffer, req.file.mimetype);
    const mode = (await hasTransparentBackground(source))
      ? "transparent"
      : "auto";
    const retained = [...sessions.values()].reduce(
      (count, value) => count + value.jobs.size,
      0,
    );
    if (active >= 3 || retained >= 20)
      throw new AppError(
        "SERVER_BUSY",
        "Limit przetwarzania został osiągnięty. Usuń poprzednie zdjęcia lub poczekaj.",
        429,
      );
    const id = randomUUID();
    const j: Job = {
      source,
      background: s.gradient,
      settings: {
        framing: { ...DEFAULT_FRAMING },
        composition: { ...DEFAULT_COMPOSITION },
        filters: { ...IMPACT_PRESET },
      },
      busy: false,
      cancelled: false,
      reviewed: false,
      mode,
      view: {
        id,
        state: "validating",
        canvaState: "unconfigured",
        warnings: [],
        hasPreview: false,
        hasSubject: false,
        filename: OUTPUT_FILENAME,
        expiresAt: Date.now() + ttl,
        revision: 0,
      },
    };
    s.jobs.set(id, j);
    void queue(() => processJob(j));
    res.status(202).json(j.view);
  });
  app.get("/api/jobs/:id", (req, res) => res.json(job(req, res).view));
  app.post("/api/jobs/:id/object-decision", (req, res) => {
    const j = job(req, res);
    const decision = z.enum(["accepted", "declined"]).parse(req.body.decision);
    if (!j.view.objectReport?.objects.length)
      throw new AppError("NO_OBJECT", "Nie wskazano obiektu do retuszu.", 409);
    j.view.objectDecision = decision;
    // This iteration records the answer only. It never edits or transmits a photo.
    res.json(j.view);
  });
  app.get("/api/jobs/:id/subject", (req, res) => {
    const j = job(req, res);
    if (!j.subject)
      throw new AppError("NOT_READY", "Poczekaj na usunięcie tła.", 409);
    res.type("png").send(j.subject);
  });
  app.get("/api/jobs/:id/preview", (req, res) => {
    const j = job(req, res);
    if (!j.png)
      throw new AppError("NOT_READY", "Podgląd nie jest jeszcze gotowy.", 409);
    res.type("png").send(j.png);
  });
  app.get("/api/jobs/:id/download", (req, res) => {
    const j = job(req, res);
    if (!j.png || j.view.state !== "complete")
      throw new AppError(
        "REVIEW_REQUIRED",
        "Sprawdź zdjęcie i zatwierdź kadrowanie przed eksportem.",
        409,
      );
    res.attachment(j.view.filename).send(j.png);
  });
  app.post("/api/jobs/:id/render", async (req, res) => {
    const j = job(req, res);
    if (j.busy)
      throw new AppError("JOB_BUSY", "Poczekaj na zakończenie operacji.", 409);
    if (active >= 3)
      throw new AppError(
        "SERVER_BUSY",
        "Serwer jest zajęty. Spróbuj za chwilę.",
        429,
      );
    const settings = renderSchema.parse(req.body),
      previousSettings = j.settings,
      previousState = j.view.state,
      previousReviewed = j.reviewed;
    j.busy = true;
    j.reviewed = false;
    try {
      await queue(async () => {
        j.settings = settings;
        await render(j);
      });
      res.json(j.view);
    } catch (e) {
      j.settings = previousSettings;
      j.view.state = previousState;
      j.reviewed = previousReviewed;
      throw e;
    } finally {
      j.busy = false;
    }
  });
  app.post("/api/jobs/:id/review", (req, res) => {
    const j = job(req, res);
    if (j.busy)
      throw new AppError("JOB_BUSY", "Poczekaj na zakończenie operacji.", 409);
    if (req.body.confirmSinglePerson !== true)
      throw new AppError(
        "REVIEW_REQUIRED",
        "Potwierdź, że zdjęcie przedstawia jednego prelegenta.",
      );
    if ((j.analysis?.people ?? 0) > 1)
      throw new AppError(
        "MULTIPLE_PEOPLE",
        "Dla kilku osób przygotuj osobne zdjęcie z jednym prelegentem.",
      );
    if (j.subject && !j.png)
      throw new AppError(
        "HEAD_MEASUREMENT_REQUIRED",
        "Najpierw zastosuj poprawny pomiar głowy i przygotuj podgląd.",
        409,
      );
    j.reviewed = true;
    j.view.error = undefined;
    if (j.subject) {
      j.view.state = "complete";
      res.json(j.view);
    } else {
      if (active >= 3)
        throw new AppError(
          "SERVER_BUSY",
          "Serwer jest zajęty. Spróbuj za chwilę.",
          429,
        );
      j.busy = true;
      j.view.state = "validating";
      void queue(() => processJob(j));
      res.status(202).json(j.view);
    }
  });
  app.delete("/api/jobs/:id", (req, res) => {
    const j = job(req, res);
    j.cancelled = true;
    session(res).jobs.delete(j.view.id);
    res.status(204).end();
  });
  app.get("/api/canva/connect", (_req, res) => {
    const s = session(res),
      auth = s.canva.authorization();
    s.oauth = {
      state: auth.state,
      verifier: auth.verifier,
      created: Date.now(),
    };
    res.redirect(auth.url);
  });
  app.get("/api/canva/callback", async (req, res) => {
    const s = session(res),
      oauth = s.oauth;
    s.oauth = undefined;
    if (
      !oauth ||
      oauth.created + 10 * 60_000 < Date.now() ||
      req.query.state !== oauth.state ||
      typeof req.query.code !== "string"
    )
      throw new AppError(
        "CANVA_AUTHORIZATION_FAILED",
        "Nieprawidłowy lub wygasły powrót Canva. Rozpocznij połączenie ponownie.",
        401,
      );
    s.tokens = await s.canva.exchange(req.query.code, oauth.verifier);
    res.redirect("/?canva=connected");
  });
  app.post("/api/canva/disconnect", (_req, res) => {
    session(res).tokens = undefined;
    res.json({ ok: true });
  });
  app.post("/api/jobs/:id/canva", (req, res) => {
    const j = job(req, res),
      s = session(res);
    if (j.busy || j.view.state !== "complete" || !j.layer)
      throw new AppError(
        "REVIEW_REQUIRED",
        "Najpierw zakończ lokalne przetwarzanie i sprawdź kadrowanie.",
        409,
      );
    if (!s.canva.configured())
      throw new AppError(
        "CANVA_NOT_CONFIGURED",
        "Skonfiguruj Canva Connect i szablon marki zgodnie z instrukcją.",
        503,
      );
    if (!s.tokens)
      throw new AppError(
        "CANVA_AUTHORIZATION_FAILED",
        "Najpierw połącz konto Canva.",
        401,
      );
    if (active >= 3)
      throw new AppError(
        "SERVER_BUSY",
        "Serwer jest zajęty. Spróbuj za chwilę.",
        429,
      );
    j.busy = true;
    j.view.state = "creating-canva-design";
    j.view.canvaState = "pending";
    j.view.canvaError = undefined;
    void queue(async () => {
      try {
        s.tokens = await s.canva.refresh(s.tokens!);
        const result = await s.canva.create(
          j.layer!,
          j.view.filename.replace(".png", ""),
          s.tokens,
          () => {
            j.view.state = "exporting";
            j.view.canvaDesign = s.canva.lastDesign;
          },
          j.view.canvaDesign,
        );
        if (!j.cancelled) {
          j.png = result.png;
          j.view.canvaDesign = { id: result.id, editUrl: result.editUrl };
          j.view.canvaState = "complete";
          j.view.revision++;
        }
      } catch (e) {
        if (!j.cancelled) {
          j.view.canvaState = "failed";
          j.view.canvaError = publicError(e);
        }
      } finally {
        j.view.state = "complete";
        j.busy = false;
      }
    });
    res.status(202).json(j.view);
  });
  app.use(express.static(resolve("dist/client")));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          code: "FILE_TOO_LARGE",
          message: "Wybierz jeden plik do 20 MB.",
        });
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: "INVALID_SETTINGS",
          message: "Sprawdź zakresy ustawień.",
        });
        return;
      }
      res
        .status(error instanceof AppError ? error.status : 500)
        .json(publicError(error));
    },
  );
  return {
    app,
    close: () => {
      clearInterval(cleanup);
      for (const s of sessions.values())
        for (const j of s.jobs.values()) j.cancelled = true;
      sessions.clear();
    },
  };
}
