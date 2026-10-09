import sharp from "sharp";
import { access } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import type { DetectedObject, ObjectReport } from "../shared/config.js";

export const OBJECT_MODEL_PATH = resolve(
  ".runtime/objects/owlvit-base-patch32",
);
export const OBJECT_MODEL_REVISION = "b75f4e52949639c3bb0b96546ea4149482f6e7ef";
export interface ObjectDetectionProvider {
  detect(subject: Buffer, known: DetectedObject[]): Promise<ObjectReport>;
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
const fallbackLabels: Record<string, string> = {
  laptop: "laptop",
  "cell phone": "telefon",
  bottle: "butelka",
  chair: "krzesło",
  keyboard: "klawiatura",
  mouse: "mysz",
  cup: "kubek",
};
export async function retainedObjects(
  subject: Buffer,
  objects: DetectedObject[],
) {
  const { data, info } = await sharp(subject)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return objects.filter(({ box }) => {
    const x0 = Math.max(0, Math.floor(box.x)),
      y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(info.width, Math.ceil(box.x + box.width)),
      y1 = Math.min(info.height, Math.ceil(box.y + box.height));
    if (x1 <= x0 || y1 <= y0) return false;
    let visible = 0,
      count = 0;
    for (let y = y0; y < y1; y += 3)
      for (let x = x0; x < x1; x += 3) {
        count++;
        if (data[(y * info.width + x) * 4 + 3] > 12) visible++;
      }
    return visible / count >= 0.1;
  });
}

export class LocalObjectDetection implements ObjectDetectionProvider {
  constructor(private modelPath = OBJECT_MODEL_PATH) {}
  private detector?: import("@huggingface/transformers").ZeroShotObjectDetectionPipeline;
  private unavailable = false;
  async detect(
    subject: Buffer,
    known: DetectedObject[],
  ): Promise<ObjectReport> {
    const fallback = await retainedObjects(
      subject,
      known
        .filter((o) => o.label in fallbackLabels)
        .map((o) => ({ ...o, label: fallbackLabels[o.label] })),
    );
    try {
      if (this.unavailable) throw new Error("Local object model unavailable");
      await access(resolve(this.modelPath, "onnx/model_quantized.onnx"));
      const { env, pipeline, RawImage } =
        await import("@huggingface/transformers");
      // No photo, telemetry or model request leaves the application at runtime.
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = dirname(resolve(this.modelPath)) + "/";
      this.detector ??= await pipeline<"zero-shot-object-detection">(
        "zero-shot-object-detection",
        basename(this.modelPath),
        {
          device: "cpu",
          dtype: "q8",
          local_files_only: true,
          session_options: { intraOpNumThreads: 2 },
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
      const predictions = await this.detector(
        new RawImage(new Uint8Array(data), info.width, info.height, 3),
        Object.keys(labels),
        { threshold: 0.15, top_k: 6 },
      );
      const objects = (
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
            height:
              ((p.box.ymax - p.box.ymin) * original.height!) / info.height,
          },
        }))
        .filter((p) => p.label && p.box.width > 0 && p.box.height > 0);
      const retained = await retainedObjects(subject, objects);
      return {
        status: "complete",
        objects: [
          ...retained,
          ...fallback.filter((o) => !retained.some((p) => p.label === o.label)),
        ],
      };
    } catch {
      this.unavailable = true;
      return {
        status: "limited",
        objects: fallback,
        message:
          "Rozszerzone wykrywanie obiektów nie jest dostępne w tej sesji. Wykrywanie podstawowych przedmiotów pozostaje aktywne.",
      };
    }
  }
}
