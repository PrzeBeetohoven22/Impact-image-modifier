import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import sharp from "sharp";
import { createApp } from "../src/server/app.js";
import { normalizeUpload, validateExport } from "../src/server/images.js";
import { hasTransparentBackground } from "../src/server/providers.js";
import type { JobView } from "../src/shared/config.js";

// Exercise both real native runtimes in the same application, repeatedly.
// The photos stay in memory; only the bundled model files are read from disk.
const paths = process.argv.slice(2);
if (!paths.length)
  throw new Error(
    "Podaj zdjęcie z tłem: npm run check:pipeline -- sciezka-do-zdjecia.jpg",
  );
const inputs = await Promise.all(
  paths.map(async (path) => {
    const image = await readFile(path);
    if (await hasTransparentBackground(image))
      throw new Error(
        "Ta próba wymaga zdjęcia z tłem, aby uruchomić oba modele ONNX.",
      );
    const { format } = await sharp(image).metadata();
    if (!["jpeg", "png", "webp"].includes(format ?? ""))
      throw new Error("Wybierz JPEG, PNG lub WebP.");
    return { image, filename: basename(path), mime: `image/${format}` };
  }),
);
const server = createServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("No test-server port");
const base = `http://127.0.0.1:${address.port}`;
const savedOrigin = process.env.APP_ORIGIN;
process.env.APP_ORIGIN = base;
const instance = createApp({
  modelBase: `${base}/internal-models/`,
  defaultGradient: await normalizeUpload(
    await readFile(
      new URL("../assets/impact-gradient-1600x1200.png", import.meta.url),
    ),
    "image/png",
    "gradient",
  ),
});
if (savedOrigin === undefined) delete process.env.APP_ORIGIN;
else process.env.APP_ORIGIN = savedOrigin;
server.on("request", instance.app);
try {
  const health = await fetch(`${base}/api/health`);
  if (!health.ok) throw new Error("Test server is unavailable");
  const cookie = health.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const count = Math.max(3, inputs.length);
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    const input = inputs[i % inputs.length];
    const form = new FormData();
    form.append(
      "photo",
      new Blob([new Uint8Array(input.image)], { type: input.mime }),
      input.filename,
    );
    const upload = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    if (upload.status !== 202)
      throw new Error(`Upload failed: ${upload.status}`);
    const { id } = (await upload.json()) as JobView;
    const deadline = Date.now() + 300_000;
    let view: JobView;
    for (;;) {
      const status = await fetch(`${base}/api/jobs/${id}`, {
        headers: { cookie },
      });
      if (!status.ok) throw new Error(`Status failed: ${status.status}`);
      view = (await status.json()) as JobView;
      if (view.state === "complete") break;
      if (["failed", "manual-review-required"].includes(view.state))
        throw new Error(`Pipeline failed: ${view.error?.code ?? view.state}`);
      if (Date.now() >= deadline) throw new Error("Pipeline timed out");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (view.objectReport?.status !== "complete")
      throw new Error(
        "Dodatkowy model nie wykonał inferencji. Sprawdź npm run setup:objects.",
      );
    const download = await fetch(`${base}/api/jobs/${id}/download`, {
      headers: { cookie },
    });
    if (!download.ok) throw new Error(`Download failed: ${download.status}`);
    await validateExport(Buffer.from(await download.arrayBuffer()));
    const alive = await fetch(`${base}/api/health`);
    if (!alive.ok) throw new Error("Server did not survive inference");
    const deleted = await fetch(`${base}/api/jobs/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    if (!deleted.ok) throw new Error("Test photo cleanup failed");
    console.info(
      `Zdjęcie ${i + 1}/${count}: oba modele, podgląd i PNG 1600 × 1200 poprawne; serwer działa (${Math.round((performance.now() - started) / 1000)} s).`,
    );
  }
} finally {
  instance.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
