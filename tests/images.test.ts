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
  buildFixedBackground,
  measureHead,
  applyAlphaMask,
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
  it("keeps the head level and scales tall or short sources proportionally", () => {
    const head = { top: 40, chin: 220, sourceWidth: 500, sourceHeight: 1400 };
    const tall = placement(
      { x: 90, y: 40, width: 320, height: 1100 },
      head,
      DEFAULT_COMPOSITION,
      DEFAULT_FRAMING,
    );
    expect(tall.top).toBe(240);
    expect(tall.scale).toBeCloseTo(1.6);
    expect(tall.headRatio).toBeCloseTo(0.3);
    const short = placement(
      { x: 90, y: 40, width: 320, height: 500 },
      head,
      DEFAULT_COMPOSITION,
      DEFAULT_FRAMING,
    );
    expect(short.headRatio).toBeCloseTo(0.36);
    expect(short.top + short.height).toBe(1200);
    expect(() =>
      placement(
        { x: 90, y: 40, width: 320, height: 300 },
        head,
        DEFAULT_COMPOSITION,
        DEFAULT_FRAMING,
      ),
    ).toThrow(/45%/);
  });
  it("requires a chin measurement when no face was detected", async () => {
    const head = await measureHead(await subjectFixture(), {
      people: 0,
      faces: [],
      warnings: [],
    });
    expect(head.chin).toBeNull();
    expect(() =>
      placement(
        { x: 90, y: 40, width: 320, height: 640 },
        head,
        DEFAULT_COMPOSITION,
        DEFAULT_FRAMING,
      ),
    ).toThrow(/brody/);
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
  it("rejects impossible head measurements without stretching or extending the source", async () => {
    await expect(
      compose(
        await subjectFixture(),
        await gradientFixture(),
        DEFAULT_COMPOSITION,
        { ...DEFAULT_FRAMING, chin: 10 },
        NEUTRAL_PRESET,
        { people: 1, faces: [face], warnings: [] },
      ),
    ).rejects.toMatchObject({ code: "INVALID_HEAD_MEASUREMENT" });
    await expect(
      compose(
        await subjectFixture(),
        await gradientFixture(),
        DEFAULT_COMPOSITION,
        { ...DEFAULT_FRAMING, chin: 42 },
        NEUTRAL_PRESET,
        { people: 1, faces: [face], warnings: [] },
      ),
    ).rejects.toMatchObject({ code: "HEAD_MEASUREMENT_TOO_SMALL" });
    await expect(
      compose(
        await subjectFixture(),
        await gradientFixture(),
        DEFAULT_COMPOSITION,
        { ...DEFAULT_FRAMING, headTop: 50, chin: 220 },
        NEUTRAL_PRESET,
        { people: 1, faces: [face], warnings: [] },
      ),
    ).rejects.toMatchObject({ code: "HEAD_TOP_MISMATCH" });
  });
  it("sanitizes names without paths or header injection", () => {
    expect(outputFilename("Łukasz Żółć /../\r\n")).toBe(
      "impact-speaker-lukasz-zolc.png",
    );
    expect(outputFilename("///")).toBe("impact-speaker-speaker.png");
  });
});

describe("approved fixed composition", () => {
  it("takes only the generated alpha mask and retains source RGB and existing transparency", async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 4,
        background: { r: 50, g: 90, b: 150, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const cutout = await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 4,
        background: { r: 230, g: 10, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const original = await sharp(source).ensureAlpha().raw().toBuffer();
    const actual = await sharp(await applyAlphaMask(source, cutout))
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(
      actual.every((value, index) =>
        index % 4 === 3
          ? value === Math.round((original[index] * original[index]) / 255)
          : value === original[index],
      ),
    ).toBe(true);
  });
  it("optional mild denoising retains alpha and translucent cutout edge colors", async () => {
    const data = Buffer.alloc(12 * 12 * 4);
    for (let i = 0; i < 12 * 12; i++) {
      data.set([80, 100, 120, i % 12 === 0 ? 100 : 255], i * 4);
    }
    data.set([230, 230, 230, 255], (6 * 12 + 6) * 4);
    const image = await sharp(data, {
      raw: { width: 12, height: 12, channels: 4 },
    })
      .png()
      .toBuffer();
    const output = await sharp(
      await applyFilters(image, { ...NEUTRAL_PRESET, denoise: true }),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect([
      ...output.subarray((6 * 12 + 6) * 4, (6 * 12 + 6) * 4 + 3),
    ]).toEqual([80, 100, 120]);
    for (let i = 3; i < data.length; i += 4) expect(output[i]).toBe(data[i]);
    expect([...output.subarray(0, 4)]).toEqual([80, 100, 120, 100]);
  });
  it("uses the complete original square unchanged in color, with white above and to the right", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL(
        "../reference_assets/impact-gradient-original.png",
        import.meta.url,
      ),
    );
    const background = await readFile(
      new URL("../assets/impact-gradient-1600x1200.png", import.meta.url),
    );
    expect(background.equals(await buildFixedBackground(source))).toBe(true);
    const expected = await sharp(source)
      .resize(1080, 1080)
      .removeAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(background)
      .extract({ left: 0, top: 120, width: 1080, height: 1080 })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(actual.equals(expected)).toBe(true);
    for (const region of [
      { left: 0, top: 0, width: 1600, height: 120 },
      { left: 1080, top: 120, width: 520, height: 1080 },
    ]) {
      const pixels = await sharp(background)
        .extract(region)
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(pixels.every((value) => value === 255)).toBe(true);
    }
  });
  it.each([30, 35, 45])(
    "anchors the visible right edge and bottom with %i%% head height",
    async (percent) => {
      const out = await compose(
        await subjectFixture(),
        await gradientFixture(),
        DEFAULT_COMPOSITION,
        {
          ...DEFAULT_FRAMING,
          headRatio: percent / 100,
          headTop: 40,
          chin: 220,
        },
        NEUTRAL_PRESET,
        { people: 1, faces: [face], warnings: [] },
      );
      const bounds = await subjectBounds(out.layer);
      expect(bounds.y).toBe(240);
      expect(bounds.x + bounds.width).toBe(1224);
      expect(bounds.y + bounds.height).toBe(1200);
      expect(out.layout.headRatio).toBeCloseTo(percent / 100);
    },
  );
  it("ignores a wide hand below the cropped frame when anchoring the visible right edge", async () => {
    const source = await sharp(
      Buffer.from(
        '<svg width="1400" height="1400"><rect x="200" y="40" width="180" height="180" fill="#b89478"/><rect x="130" y="220" width="320" height="1000" fill="#273b65"/><rect x="450" y="1100" width="800" height="70" fill="#b89478"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    const out = await compose(
      source,
      await gradientFixture(),
      DEFAULT_COMPOSITION,
      { ...DEFAULT_FRAMING, headTop: 40, chin: 220 },
      NEUTRAL_PRESET,
      {
        people: 1,
        faces: [{ x: 200, y: 50, width: 180, height: 160 }],
        warnings: [],
      },
    );
    const bounds = await subjectBounds(out.layer);
    expect(bounds.x + bounds.width).toBe(1224);
    expect(bounds.width).toBeLessThan(550);
    expect(bounds.y + bounds.height).toBe(1200);
  });
});
