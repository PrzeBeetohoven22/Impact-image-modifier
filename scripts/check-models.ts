import express from "express";
import sharp from "sharp";
import {
  LocalSubjectAnalysis,
  LocalBackgroundRemoval,
} from "../src/server/providers.js";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
const app = express();
app.use(
  "/models",
  express.static(resolve("node_modules/@vladmandic/human/models")),
);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No model port");
  const input = await sharp({
    create: { width: 320, height: 400, channels: 3, background: "#eeeeee" },
  })
    .png()
    .toBuffer();
  const detector = new LocalSubjectAnalysis(
    `http://127.0.0.1:${address.port}/models/`,
  );
  const detected = await detector.analyze(input);
  if (detected.people !== 0)
    throw new Error("Blank-image detector returned a person");
  console.info(
    "Person/face models: loaded, inference complete, blank image has no person.",
  );
  if (process.argv[2]) {
    const sample = await readFile(process.argv[2]);
    const result = await detector.analyze(sample);
    console.info("Sample detection:", JSON.stringify(result));
    if (result.people !== 1 || result.faces.length !== 1)
      throw new Error("Single-person sample not detected");
    const isolated = await new LocalBackgroundRemoval().remove(sample);
    await writeFile("/tmp/impact-isolated-test.png", isolated);
    const { subjectBounds } = await import("../src/server/images.js");
    console.info("Sample subject bounds:", await subjectBounds(isolated));
  }
  const output = await new LocalBackgroundRemoval().remove(input);
  const m = await sharp(output).metadata();
  if (!m.hasAlpha || m.width !== 320 || m.height !== 400)
    throw new Error("Invalid segmentation output");
  console.info(
    "Background-removal model: loaded, inference complete, RGBA PNG dimensions preserved.",
  );
} finally {
  server.close();
}
