import sharp from "sharp";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeModelProcess } from "./native-process.js";
import type { DetectedObject, ObjectReport } from "../shared/config.js";

export const OBJECT_MODEL_PATH = resolve(
  ".runtime/objects/owlvit-base-patch32",
);
export const OBJECT_MODEL_REVISION = "b75f4e52949639c3bb0b96546ea4149482f6e7ef";
export interface ObjectDetectionProvider {
  detect(subject: Buffer, known: DetectedObject[]): Promise<ObjectReport>;
  close?(): void;
}
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
  private worker = new NativeModelProcess("objects");
  close() {
    this.worker.close();
  }
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
      await access(resolve(this.modelPath, "onnx/model_quantized.onnx"));
      const objects = await this.worker.run(subject, this.modelPath);
      const retained = await retainedObjects(subject, objects);
      return {
        status: "complete",
        objects: [
          ...retained,
          ...fallback.filter((o) => !retained.some((p) => p.label === o.label)),
        ],
      };
    } catch {
      return {
        status: "limited",
        objects: fallback,
        message:
          "Rozszerzone wykrywanie obiektów nie jest dostępne dla tego zdjęcia. Możesz pobrać PNG; wykrywanie podstawowych przedmiotów pozostaje aktywne.",
      };
    }
  }
}
