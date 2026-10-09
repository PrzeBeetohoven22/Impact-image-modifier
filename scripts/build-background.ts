import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildFixedBackground } from "../src/server/images.js";

const source = await readFile(
  new URL("../reference_assets/impact-gradient-original.png", import.meta.url),
);
const background = await buildFixedBackground(source);
await writeFile(
  new URL("../assets/impact-gradient-1600x1200.png", import.meta.url),
  background,
);
console.info("Stałe tło 1600 × 1200: kwadrat 1080 × 1080 w (0, 120).");
console.info(
  `SHA-256: ${createHash("sha256").update(background).digest("hex")}`,
);
