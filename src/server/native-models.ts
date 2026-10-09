import sharp from "sharp";
import { basename, dirname, resolve } from "node:path";
import type { DetectedObject } from "../shared/config.js";
import { applyAlphaMask } from "./images.js";

// Imported only in a child process. Each child invokes one of these functions,
// so IMG.LY's ONNX 1.17 and Transformers' ONNX 1.21 can never load together.
export async function removeBackgroundLocally(image: Buffer) {
  const { removeBackground } = await import("@imgly/background-removal-node");
  const input = await sharp(image)
    .resize({
      width: 3200,
      height: 3200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const blob = await removeBackground(
    new Blob([new Uint8Array(input)], { type: "image/png" }),
    {
      model: "medium",
      debug: false,
      output: { format: "image/png", quality: 1 },
    },
  );
  return applyAlphaMask(image, Buffer.from(await blob.arrayBuffer()));
}

const labels: Record<string, string> = {
  "a microphone": "mikrofon",
  "a microphone stand": "statyw mikrofonu",
  "a laptop computer": "laptop",
  "a mobile phone": "telefon",
  "a podium": "mównica",
  "a bottle": "butelka",
  "a chair": "krzesło",
};
let detector:
  | import("@huggingface/transformers").ZeroShotObjectDetectionPipeline
  | undefined;
export async function detectObjectsLocally(
  subject: Buffer,
  modelPath: string,
): Promise<DetectedObject[]> {
  const { env, pipeline, RawImage } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = dirname(resolve(modelPath)) + "/";
  detector ??= await pipeline<"zero-shot-object-detection">(
    "zero-shot-object-detection",
    basename(modelPath),
    {
      device: "cpu",
      dtype: "q8",
      local_files_only: true,
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    },
  );
  const original = await sharp(subject).metadata();
  const { data, info } = await sharp(subject)
    .flatten({ background: "#ffffff" })
    .resize({
      width: 1000,
      height: 1000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const predictions = await detector(
    new RawImage(new Uint8Array(data), info.width, info.height, 3),
    Object.keys(labels),
    { threshold: 0.15, top_k: 6 },
  );
  return (
    predictions as {
      label: string;
      score: number;
      box: { xmin: number; ymin: number; xmax: number; ymax: number };
    }[]
  )
    .map((p) => ({
      label: labels[p.label],
      confidence: p.score,
      box: {
        x: (p.box.xmin * original.width!) / info.width,
        y: (p.box.ymin * original.height!) / info.height,
        width: ((p.box.xmax - p.box.xmin) * original.width!) / info.width,
        height: ((p.box.ymax - p.box.ymin) * original.height!) / info.height,
      },
    }))
    .filter((p) => p.label && p.box.width > 0 && p.box.height > 0);
}
