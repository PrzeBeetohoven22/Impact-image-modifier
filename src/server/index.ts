import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.js";
import { normalizeUpload } from "./images.js";
const port = Number(process.env.PORT ?? 3001);
const defaultGradient = await normalizeUpload(
  await readFile(
    new URL("../../assets/impact-gradient-1600x1200.png", import.meta.url),
  ),
  "image/png",
  "gradient",
);
const { app, close } = createApp({
  defaultGradient,
  modelBase: `http://127.0.0.1:${port}/internal-models/`,
  canva: {
    clientId: process.env.CANVA_CLIENT_ID,
    clientSecret: process.env.CANVA_CLIENT_SECRET,
    basicAuth: process.env.CANVA_BASIC_AUTH,
    redirectUri: process.env.CANVA_REDIRECT_URI,
    templateId: process.env.CANVA_BRAND_TEMPLATE_ID,
    imageField: process.env.CANVA_IMAGE_FIELD,
  },
});
const server = app.listen(port, process.env.HOST ?? "127.0.0.1", () =>
  console.info(`Serwer zdjęć uruchomiony na porcie ${port}.`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    close();
    server.close(() => process.exit(0));
  });
