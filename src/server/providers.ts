import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Analysis } from "../shared/config.js";
import { AppError } from "./errors.js";
import { applyAlphaMask } from "./images.js";
export interface BackgroundRemovalProvider {
  remove(image: Buffer): Promise<Buffer>;
}
export interface SubjectAnalysisProvider {
  analyze(image: Buffer): Promise<Analysis>;
}
export class LocalBackgroundRemoval implements BackgroundRemovalProvider {
  async remove(image: Buffer) {
    try {
      const { removeBackground } =
        await import("@imgly/background-removal-node");
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
      const result = Buffer.from(await blob.arrayBuffer());
      return applyAlphaMask(image, result);
    } catch {
      throw new AppError(
        "BACKGROUND_REMOVAL_FAILED",
        "Usunięcie tła nie powiodło się. Spróbuj innego zdjęcia lub wgraj wyciętą sylwetkę PNG.",
        503,
      );
    }
  }
}
export class TransparentPngProvider implements BackgroundRemovalProvider {
  async remove(image: Buffer) {
    const { data, info } = await sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let transparent = 0,
      visible = 0;
    for (let i = 3; i < data.length; i += info.channels) {
      if (data[i] < 12) transparent++;
      if (data[i] > 12) visible++;
    }
    if (transparent < info.width * info.height * 0.01 || !visible)
      throw new AppError(
        "TRANSPARENCY_REQUIRED",
        "Ten tryb wymaga PNG z już usuniętym tłem. Wybierz tryb automatyczny dla zwykłego zdjęcia.",
      );
    return image;
  }
}
export class LocalSubjectAnalysis implements SubjectAnalysisProvider {
  private engine?: import("@vladmandic/human").Human;
  constructor(private modelBase: string) {}
  async analyze(image: Buffer): Promise<Analysis> {
    if (!this.engine) {
      const entry = createRequire(import.meta.url).resolve("@vladmandic/human");
      const { Human } = (await import(
        pathToFileURL(resolve(dirname(entry), "human.node-wasm.js")).href
      )) as typeof import("@vladmandic/human");
      this.engine = new Human({
        backend: "wasm",
        wasmPath:
          resolve("node_modules/@tensorflow/tfjs-backend-wasm/dist") + "/",
        modelBasePath: this.modelBase,
        debug: false,
        async: false,
        cacheModels: false,
        cacheSensitivity: 0,
        skipAllowed: false,
        warmup: "none",
        filter: { enabled: false },
        body: { enabled: false },
        hand: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false },
        face: {
          enabled: true,
          detector: {
            maxDetected: 10,
            minConfidence: 0.55,
            skipFrames: 0,
            skipTime: 0,
            return: false,
          },
          mesh: { enabled: false },
          attention: { enabled: false },
          iris: { enabled: false },
          description: { enabled: false },
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
        },
        object: {
          enabled: true,
          minConfidence: 0.4,
          maxDetected: 20,
          skipFrames: 0,
          skipTime: 0,
        },
      });
    }
    const { data, info } = await sharp(image)
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
    const original = await sharp(image).metadata();
    const engine = this.engine!;
    await engine.init();
    const tensor = engine.tf.tensor3d(
      new Uint8Array(data),
      [info.height, info.width, 3],
      "int32",
    );
    try {
      const result = await engine.detect(tensor);
      if (result.error) throw new Error(result.error);
      const loaded = engine.models.loaded();
      if (loaded.length < 2)
        throw new AppError(
          "ANALYSIS_UNAVAILABLE",
          "Modele wykrywania osób nie są dostępne. Sprawdź instalację środowiska.",
          503,
        );
      const sx = original.width! / info.width,
        sy = original.height! / info.height;
      const faces = result.face.map((f) => ({
        x: f.box[0] * sx,
        y: f.box[1] * sy,
        width: f.box[2] * sx,
        height: f.box[3] * sy,
      }));
      const people = Math.max(
        result.object.filter((o) => o.label === "person").length,
        faces.length,
      );
      return {
        people,
        faces,
        warnings:
          faces.length === 0
            ? [
                "Nie wykryto twarzy. Sprawdź, czy głowa i cała sylwetka są prawidłowo widoczne.",
              ]
            : [],
      };
    } finally {
      tensor.dispose();
    }
  }
}
