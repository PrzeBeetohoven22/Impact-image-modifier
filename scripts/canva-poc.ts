import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { CanvaService } from "../src/server/canva.js";
// Optional CLI proof of concept. Normal use authenticates through the server's OAuth flow.
const input = process.argv[2],
  output = process.argv[3];
if (!input || !output || !process.env.CANVA_POC_ACCESS_TOKEN) {
  console.error(
    "Provide a 1600 × 1200 transparent subject-layer PNG, output path, and securely configured CANVA_POC_ACCESS_TOKEN. Alternatively use the application OAuth flow and Canva button.",
  );
  process.exit(1);
}
const layer = await readFile(input),
  m = await sharp(layer).metadata();
if (m.format !== "png" || m.width !== 1600 || m.height !== 1200 || !m.hasAlpha)
  throw new Error("Expected transparent subject layer, 1600 × 1200 PNG.");
const service = new CanvaService({
  clientId: process.env.CANVA_CLIENT_ID,
  clientSecret: process.env.CANVA_CLIENT_SECRET,
  basicAuth: process.env.CANVA_BASIC_AUTH,
  redirectUri: process.env.CANVA_REDIRECT_URI,
  templateId: process.env.CANVA_BRAND_TEMPLATE_ID,
  imageField: process.env.CANVA_IMAGE_FIELD,
});
const result = await service.create(
  layer,
  "Impact speaker POC",
  {
    access_token: process.env.CANVA_POC_ACCESS_TOKEN,
    refresh_token: "",
    expires_at: Date.now() + 3600_000,
  },
  () => console.info("Editable design created; validating PNG export…"),
);
await writeFile(output, result.png, { flag: "wx" });
console.info(
  "Verified: editable Canva design URL returned, exported PNG is 1600 × 1200 sRGB, opaque. Open the design manually to verify editable layers and visual parity.",
);
console.info(result.editUrl);
