import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  normalizeUpload,
  subjectBounds,
  placement,
  compose,
  validateExport,
  applyFilters,
  outputFilename,
  MAX_UPLOAD,
  prepareGradient,
} from "../src/server/images";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_FRAMING,
  NEUTRAL_PRESET,
  IMPACT_PRESET,
} from "../src/shared/config";
import { subjectFixture, gradientFixture, face } from "./fixtures";
describe("upload validation", () => {
  it("rejects unsupported files and MIME spoofing", async () => {
    await expect(
      normalizeUpload(Buffer.from("text"), "text/plain"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
    await expect(
      normalizeUpload(await subjectFixture(), "image/jpeg"),
    ).rejects.toMatchObject({ code: "MIME_MISMATCH" });
  });
  it("rejects oversized, corrupt and tiny images", async () => {
    await expect(
      normalizeUpload(Buffer.alloc(MAX_UPLOAD + 1), "image/png"),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(
      normalizeUpload(Buffer.from("bad"), "image/png"),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    const small = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    await expect(normalizeUpload(small, "image/png")).rejects.toMatchObject({
      code: "IMAGE_TOO_SMALL",
    });
  });
  it("applies EXIF orientation and removes camera metadata", async () => {
    const image = await sharp({
      create: { width: 400, height: 600, channels: 3, background: "#ccc" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const m = await sharp(
      await normalizeUpload(image, "image/jpeg"),
    ).metadata();
    expect([m.width, m.height]).toEqual([600, 400]);
    expect(m.orientation).toBeUndefined();
    expect(m.exif).toBeUndefined();
  });
  it("requires an opaque, approved 4:3 background", async () => {
    await expect(
      normalizeUpload(await subjectFixture(), "image/png", "gradient"),
    ).rejects.toMatchObject({ code: "GRADIENT_DIMENSIONS" });
    const transparent = await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 4,
        background: "#00000000",
      },
    })
      .png()
      .toBuffer();
    await expect(
      normalizeUpload(transparent, "image/png", "gradient"),
    ).rejects.toMatchObject({ code: "GRADIENT_TRANSPARENT" });
  });
});

describe("selected gradient cutout", () => {
  it("removes black padding while preserving colors and the aspect ratio of interior shapes", async () => {
    const source = await sharp(
      Buffer.from(
        '<svg width="900" height="900"><rect width="900" height="900" fill="black"/><rect x="150" y="100" width="600" height="600" fill="#ff0055"/><rect x="350" y="300" width="100" height="100" fill="white"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    const output = await prepareGradient(source, "image/png", "cutout");
    const { data, info } = await sharp(output)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1600, 1200]);
    expect([...data.subarray(0, 3)]).toEqual([255, 0, 85]);
    let minX = 1600,
      minY = 1200,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 3;
        if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    expect(maxX - minX).toBeGreaterThan(260);
    expect(Math.abs(maxX - minX - (maxY - minY))).toBeLessThanOrEqual(1);
  });
  it("does not remove black padding unless cutout mode is explicitly chosen", async () => {
    const source = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await expect(
      prepareGradient(source, "image/png", "canvas"),
    ).rejects.toMatchObject({ code: "GRADIENT_DIMENSIONS" });
    await expect(
      prepareGradient(source, "image/png", "cutout"),
    ).rejects.toMatchObject({ code: "EMPTY_GRADIENT" });
  });
});
describe("matting and composition", () => {
  it("finds nontransparent bounds without including outer padding", async () => {
    expect(await subjectBounds(await subjectFixture())).toEqual({
      x: 90,
      y: 40,
      width: 320,
      height: 640,
    });
  });
  it("rejects an empty alpha mask", async () => {
    const empty = await sharp({
      create: { width: 300, height: 400, channels: 4, background: "#00000000" },
    })
      .png()
      .toBuffer();
    await expect(subjectBounds(empty)).rejects.toMatchObject({
      code: "NO_SUBJECT",
    });
  });
  it("anchors the face and gives zoom and offsets consistent pixel coordinates", () => {
    const b = { x: 90, y: 40, width: 320, height: 640 };
    const c = { ...DEFAULT_COMPOSITION, minimumHeadMargin: 0 };
    const base = placement(b, face, c, DEFAULT_FRAMING);
    expect(
      base.top + (face.y + face.height / 2 - b.y) * base.scale,
    ).toBeCloseTo(c.faceTargetY, 0);
    expect(
      base.left + (face.x + face.width / 2 - b.x) * base.scale,
    ).toBeCloseTo(c.faceTargetX, 0);
    const moved = placement(b, face, c, { zoom: 1, x: 100, y: 80 });
    expect(moved.left - base.left).toBe(100);
    expect(moved.top - base.top).toBe(80);
    expect(placement(b, face, c, { zoom: 2, x: 0, y: 0 }).width).toBe(
      base.width * 2,
    );
  });
  it("preserves alpha and produces lower saturation with the screenshot preset", async () => {
    const source = await subjectFixture();
    const original = await sharp(source).ensureAlpha().raw().toBuffer();
    const altered = await sharp(await applyFilters(source, IMPACT_PRESET))
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let i = 3; i < original.length; i += 4)
      expect(altered[i]).toBe(original[i]);
    const index = (300 * 500 + 200) * 4;
    const spread = (b: Buffer) =>
      Math.max(...b.subarray(index, index + 3)) -
      Math.min(...b.subarray(index, index + 3));
    expect(spread(altered)).toBeLessThan(spread(original));
  });
  it("leaves background pixels unchanged and exports 1600 × 1200 sRGB without transparency or EXIF", async () => {
    const bg = await gradientFixture();
    const out = await compose(
      await subjectFixture(),
      bg,
      DEFAULT_COMPOSITION,
      DEFAULT_FRAMING,
      IMPACT_PRESET,
      { people: 1, faces: [face], warnings: [] },
    );
    await validateExport(out.png);
    const m = await sharp(out.png).metadata();
    expect(m.icc).toBeDefined();
    expect(m.exif).toBeUndefined();
    const pixel = await sharp(out.png)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel]).toEqual([230, 30, 90]);
    const layer = await sharp(out.layer).metadata();
    expect(layer.hasAlpha).toBe(true);
  });
  it("rejects an entirely invisible framing and warns about head cropping", async () => {
    const source = await subjectFixture(),
      bg = await gradientFixture();
    const c = {
      ...DEFAULT_COMPOSITION,
      targetX: 1600,
      anchor: "subject" as const,
    };
    await expect(
      compose(source, bg, c, { zoom: 0.5, x: 800, y: 0 }, NEUTRAL_PRESET, {
        people: 1,
        faces: [face],
        warnings: [],
      }),
    ).rejects.toMatchObject({ code: "SUBJECT_OUTSIDE" });
    const r = await compose(
      source,
      bg,
      DEFAULT_COMPOSITION,
      { zoom: 1, x: 0, y: -400 },
      NEUTRAL_PRESET,
      { people: 1, faces: [face], warnings: [] },
    );
    expect(r.warnings.join(" ")).toContain("Twarz jest przycięta");
  });
  it("sanitizes names without paths or header injection", () => {
    expect(outputFilename("Łukasz Żółć /../\r\n")).toBe(
      "impact-speaker-lukasz-zolc.png",
    );
    expect(outputFilename("///")).toBe("impact-speaker-speaker.png");
  });
});
