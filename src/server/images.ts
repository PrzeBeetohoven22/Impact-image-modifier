import sharp from "sharp";
import type {
  Analysis,
  Composition,
  Filters,
  Framing,
  Rect,
  GradientMode,
  HeadMeasurement,
  LayoutMetrics,
} from "../shared/config.js";
import { BACKGROUND_LAYOUT, OUTPUT } from "../shared/config.js";
import { AppError } from "./errors.js";
export const MAX_UPLOAD = 20 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export async function applyAlphaMask(
  source: Buffer,
  cutout: Buffer,
): Promise<Buffer> {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = await sharp(cutout)
    .resize(info.width, info.height)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer();
  for (let i = 0; i < mask.length; i++)
    data[i * 4 + 3] = Math.round((data[i * 4 + 3] * mask[i]) / 255);
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
export async function buildFixedBackground(square: Buffer): Promise<Buffer> {
  const m = await sharp(square).metadata();
  if (!m.width || m.width !== m.height)
    throw new AppError("GRADIENT_NOT_SQUARE", "Gradient musi być kwadratem.");
  const gradient = await sharp(square)
    .resize(BACKGROUND_LAYOUT.size, BACKGROUND_LAYOUT.size)
    .removeAlpha()
    .png()
    .toBuffer();
  return sharp({
    create: { ...OUTPUT, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: gradient,
        left: BACKGROUND_LAYOUT.left,
        top: BACKGROUND_LAYOUT.top,
      },
    ])
    .withIccProfile("srgb")
    .png()
    .toBuffer();
}
export async function prepareGradient(
  input: Buffer,
  mime: string,
  mode: GradientMode = "canvas",
): Promise<Buffer> {
  if (mode === "canvas") return normalizeUpload(input, mime, "gradient");
  const source = await normalizeUpload(input, mime);
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  // Only the explicitly selected cutout mode removes black/transparent outer padding.
  // Keep every pixel inside the resulting rectangle, including any interior black pixels.
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      if (
        data[offset + 3] > 12 &&
        Math.max(data[offset], data[offset + 1], data[offset + 2]) > 12
      ) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left || bottom < top)
    throw new AppError(
      "EMPTY_GRADIENT",
      "Nie znaleziono gradientu poza czarnymi marginesami. Wybierz właściwy plik.",
    );
  if (right - left + 1 < 300 || bottom - top + 1 < 300)
    throw new AppError(
      "GRADIENT_TOO_SMALL",
      "Wycinek gradientu musi mieć co najmniej 300 px na krótszym boku.",
    );
  const cropped = await sharp(source)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
  const pixels = await sharp(cropped).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < pixels.length; i += 4)
    if (pixels[i] !== 255)
      throw new AppError(
        "GRADIENT_TRANSPARENT",
        "Wycinek gradientu musi być nieprzezroczysty. Wybierz plik bez przezroczystych fragmentów wewnątrz kadru.",
      );
  // Preserve aspect ratio. A square cutout fills 4:3 by trimming the top/bottom equally.
  const canvas = await sharp(cropped)
    .resize(OUTPUT.width, OUTPUT.height, { fit: "cover", position: "centre" })
    .removeAlpha()
    .png()
    .toBuffer();
  return normalizeUpload(canvas, "image/png", "gradient");
}
export async function normalizeUpload(
  input: Buffer,
  mime: string,
  kind: "speaker" | "gradient" = "speaker",
): Promise<Buffer> {
  if (input.length > MAX_UPLOAD)
    throw new AppError("FILE_TOO_LARGE", "Plik przekracza limit 20 MB.");
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!formats[mime])
    throw new AppError(
      "UNSUPPORTED_TYPE",
      "Wybierz zdjęcie JPEG, PNG lub WebP.",
    );
  try {
    const m = await sharp(input, {
      limitInputPixels: MAX_PIXELS,
      failOn: "warning",
    }).metadata();
    if (m.format !== formats[mime])
      throw new AppError(
        "MIME_MISMATCH",
        "Zawartość pliku nie odpowiada jego typowi.",
      );
    if ((m.pages ?? 1) > 1)
      throw new AppError(
        "ANIMATED_IMAGE",
        "Wybierz pojedynczy obraz, bez animacji.",
      );
    if (!m.width || !m.height || Math.min(m.width, m.height) < 300)
      throw new AppError(
        "IMAGE_TOO_SMALL",
        "Zdjęcie musi mieć co najmniej 300 px na krótszym boku.",
      );
    const result = await sharp(input, {
      limitInputPixels: MAX_PIXELS,
      failOn: "warning",
    })
      .rotate()
      .toColourspace("srgb")
      .png()
      .toBuffer();
    if (kind === "gradient") {
      const g = await sharp(result).metadata();
      if (g.width !== OUTPUT.width || g.height !== OUTPUT.height)
        throw new AppError(
          "GRADIENT_DIMENSIONS",
          "Wgraj zatwierdzone tło 1600 × 1200 px. Aplikacja nie zmienia jego kadru ani proporcji.",
        );
      const { data, info } = await sharp(result)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += info.channels)
        if (data[i] !== 255)
          throw new AppError(
            "GRADIENT_TRANSPARENT",
            "Tło musi być całkowicie nieprzezroczyste.",
          );
    }
    return result;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "INVALID_IMAGE",
      "Nie można odczytać obrazu. Wybierz poprawny plik do 40 megapikseli.",
    );
  }
}
export async function subjectBounds(input: Buffer): Promise<Rect> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width,
    minY = info.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  if (maxX < 0)
    throw new AppError(
      "NO_SUBJECT",
      "Po usunięciu tła nie znaleziono sylwetki. Wybierz inne zdjęcie.",
    );
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
export async function measureHead(
  input: Buffer,
  analysis: Analysis,
): Promise<HeadMeasurement> {
  const info = await sharp(input).metadata();
  const bounds = await subjectBounds(input);
  const face = analysis.faces.length === 1 ? analysis.faces[0] : undefined;
  // For a portrait, the highest visible mask point is the top of the hair.
  // The user checks this estimate against the cutout before approving export.
  const top = bounds.y;
  const chin = face
    ? Math.min(info.height!, Math.round(face.y + face.height))
    : null;
  return {
    top,
    chin: chin !== null && chin > top ? chin : null,
    sourceWidth: info.width!,
    sourceHeight: info.height!,
  };
}
export function placement(
  bounds: Rect,
  head: HeadMeasurement,
  c: Composition,
  f: Framing,
) {
  const headTop = f.headTop ?? head.top,
    chin = f.chin ?? head.chin;
  const measuredChin =
    chin ?? headTop + (bounds.y + bounds.height - headTop) * 0.3;
  if (
    headTop < bounds.y ||
    measuredChin <= headTop ||
    measuredChin > bounds.y + bounds.height
  )
    throw new AppError(
      "INVALID_HEAD_MEASUREMENT",
      "Linia brody musi być poniżej czubka włosów i mieścić się w zdjęciu.",
    );
  const visibleHeight = c.targetBottom - c.headTop;
  const headHeight = measuredChin - headTop;
  // Increase only when the source ends before the bottom of the target canvas.
  // A full-body source is enlarged to the head target and cropped below the frame.
  const scale = Math.max(
    Math.min((960 * f.headRatio) / headHeight, visibleHeight / headHeight),
    visibleHeight / (bounds.y + bounds.height - headTop),
  );
  const headRatio = (headHeight * scale) / visibleHeight;
  return {
    top: Math.round(c.headTop - (headTop - bounds.y) * scale),
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.ceil(bounds.height * scale)),
    scale,
    headTop,
    chin: measuredChin,
    headRatio,
  };
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export async function applyFilters(input: Buffer, p: Filters): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    let r = data[i] / 255,
      g = data[i + 1] / 255,
      b = data[i + 2] / 255;
    r += p.temperature * 0.0015 + p.tint * 0.0005;
    g -= p.tint * 0.001;
    b -= p.temperature * 0.0015;
    const lum = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const light =
      p.brightness / 250 +
      (p.highlights / 300) * lum ** 2 +
      (p.shadows / 300) * (1 - lum) ** 2 +
      (p.whites / 300) * lum ** 4 +
      (p.blacks / 300) * (1 - lum) ** 4;
    const contrast = 1 + p.contrast / 150;
    r = (r - 0.5) * contrast + 0.5 + light;
    g = (g - 0.5) * contrast + 0.5 + light;
    b = (b - 0.5) * contrast + 0.5 + light;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const saturation = Math.max(
      0,
      (1 + p.saturation / 100) * (1 + (p.vibrance / 100) * (1 - clamp(chroma))),
    );
    r = l + (r - l) * saturation;
    g = l + (g - l) * saturation;
    b = l + (b - l) * saturation;
    if (p.invert) {
      r = 1 - r;
      g = 1 - g;
      b = 1 - b;
    }
    if (p.vignette) {
      const px = (i / 4) % info.width,
        py = Math.floor(i / 4 / info.width);
      const d =
        (((px / info.width - 0.5) ** 2 + (py / info.height - 0.5) ** 2) *
          p.vignette) /
        100;
      r *= 1 - d;
      g *= 1 - d;
      b *= 1 - d;
    }
    data[i] = Math.round(clamp(r) * 255);
    data[i + 1] = Math.round(clamp(g) * 255);
    data[i + 2] = Math.round(clamp(b) * 255);
  }
  let image = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
  const amount = (p.sharpness + Math.max(0, p.clarity)) / 100;
  if (amount > 0)
    image = image.sharpen({ sigma: 1, m1: amount, m2: amount * 2 });
  if (p.clarity < 0) image = image.blur(0.3 + Math.abs(p.clarity) / 100);
  // Preserve original alpha after sharpening: edge opacity must never change with the preset.
  const rgb = await image.removeAlpha().raw().toBuffer();
  if (p.denoise) {
    const smoothed = await sharp(rgb, {
      raw: { width: info.width, height: info.height, channels: 3 },
    })
      .median(3)
      .raw()
      .toBuffer();
    // Denoise only inside the opaque mask. Hair and blended cutout edges retain
    // their RGB and alpha; smoothing never changes the silhouette geometry.
    for (let y = 1; y < info.height - 1; y++)
      for (let x = 1; x < info.width - 1; x++) {
        let opaque = true;
        for (let yy = y - 1; yy <= y + 1 && opaque; yy++)
          for (let xx = x - 1; xx <= x + 1; xx++)
            if (data[(yy * info.width + xx) * 4 + 3] < 250) {
              opaque = false;
              break;
            }
        if (opaque) {
          const offset = (y * info.width + x) * 3;
          rgb[offset] = smoothed[offset];
          rgb[offset + 1] = smoothed[offset + 1];
          rgb[offset + 2] = smoothed[offset + 2];
        }
      }
  }
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    data[i] = rgb[j];
    data[i + 1] = rgb[j + 1];
    data[i + 2] = rgb[j + 2];
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
export async function compose(
  subject: Buffer,
  background: Buffer,
  c: Composition,
  f: Framing,
  filters: Filters,
  analysis: Analysis,
  measurement?: HeadMeasurement,
) {
  const bounds = await subjectBounds(subject);
  const head = measurement ?? (await measureHead(subject, analysis));
  const pos = placement(bounds, head, c, f),
    warnings: string[] = [];
  if (f.chin === null)
    warnings.push(
      "Pomiar głowy jest szacunkowy. Sprawdź linie włosów i brody na wyciętej sylwetce; w razie potrzeby je popraw.",
    );
  if (
    (bounds.y + bounds.height - pos.headTop) *
      ((960 * f.headRatio) / (pos.chin - pos.headTop)) <
    c.targetBottom - c.headTop
  )
    warnings.push(
      "Krótki kadr źródłowy został powiększony tak, aby sylwetka sięgała dolnej krawędzi.",
    );
  if (pos.scale > 1.4)
    warnings.push(
      "Zdjęcie wymaga znacznego powiększenia. Rozważ plik o wyższej rozdzielczości.",
    );
  if (pos.scale > 100)
    throw new AppError(
      "HEAD_MEASUREMENT_TOO_SMALL",
      "Zaznacz całą głowę od czubka włosów do brody. Ten pomiar wymagałby nadmiernego powiększenia zdjęcia.",
    );
  // Crop in source coordinates first. Wide panoramas and long full-body photos
  // must not allocate a huge upscaled image merely to discard most of it.
  const cropY = bounds.y + Math.max(0, Math.floor(-pos.top / pos.scale));
  const cropBottom = Math.min(
    bounds.y + bounds.height,
    bounds.y + Math.ceil((OUTPUT.height - pos.top) / pos.scale),
  );
  const sourceVertical = await sharp(subject)
    .extract({
      left: bounds.x,
      top: cropY,
      width: bounds.width,
      height: cropBottom - cropY,
    })
    .png()
    .toBuffer();
  const sourceVisible = await subjectBounds(sourceVertical);
  const sourceRight = sourceVisible.x + sourceVisible.width;
  let cropX = Math.max(0, Math.floor(sourceRight - c.subjectRight / pos.scale));
  let cropRight = sourceRight;
  const face = analysis.faces.length === 1 ? analysis.faces[0] : undefined;
  if (face && cropX > face.x - bounds.x - face.width * 0.3) {
    // A wide foreground (e.g. a desk) must not push the actual face out of frame.
    // Reframe the source window around the face; pixels are cropped, never generated.
    const sourceWindow = Math.min(
      sourceRight,
      Math.ceil(c.subjectRight / pos.scale),
    );
    cropX = Math.max(
      0,
      Math.min(
        sourceRight - sourceWindow,
        Math.floor(face.x + face.width / 2 - bounds.x - sourceWindow * 0.65),
      ),
    );
    cropRight = Math.min(sourceRight, cropX + sourceWindow);
    warnings.push(
      "Szeroki kadr został przycięty wokół twarzy, aby pozostała widoczna.",
    );
  }
  const scaledWidth = Math.max(1, Math.round((cropRight - cropX) * pos.scale));
  const scaledHeight = Math.max(1, Math.ceil((cropBottom - cropY) * pos.scale));
  const resized = await sharp(sourceVertical)
    .extract({
      left: cropX,
      top: 0,
      width: cropRight - cropX,
      height: cropBottom - cropY,
    })
    .resize(scaledWidth, scaledHeight)
    .png()
    .toBuffer();
  const outputTop = Math.round(pos.top + (cropY - bounds.y) * pos.scale);
  const sy = Math.max(0, -outputTop),
    dy = Math.max(0, outputTop);
  const height = Math.min(scaledHeight - sy, OUTPUT.height - dy);
  const vertical = await sharp(resized)
    .extract({ left: 0, top: sy, width: scaledWidth, height })
    .png()
    .toBuffer();
  // Anchor the rightmost VISIBLE pixel, not a hand or elbow below the crop.
  const visibleBounds = await subjectBounds(vertical);
  const left = c.subjectRight - visibleBounds.x - visibleBounds.width;
  if (cropX > sourceVisible.x || left + visibleBounds.x < 0)
    warnings.push(
      "Szeroki kadr został przycięty po lewej stronie. Zmniejsz wielkość sylwetki, jeśli chcesz pokazać więcej zdjęcia.",
    );
  const sx = Math.max(0, -left),
    dx = Math.max(0, left);
  const width = Math.min(scaledWidth - sx, OUTPUT.width - dx);
  const filtered = await applyFilters(vertical, filters);
  const visible = await sharp(filtered)
    .extract({ left: sx, top: 0, width, height })
    .png()
    .toBuffer();
  const layer = await sharp({
    create: {
      ...OUTPUT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: visible, left: dx, top: dy }])
    .png()
    .toBuffer();
  const actual = await subjectBounds(layer);
  const layout: LayoutMetrics = {
    headTop: c.headTop,
    subjectRight: actual.x + actual.width,
    subjectBottom: actual.y + actual.height,
    headRatio: pos.headRatio,
    measurement: f.chin === null ? "estimated" : "manual",
  };
  const png = await sharp(background)
    .composite([{ input: layer }])
    .removeAlpha()
    .toColourspace("srgb")
    .withIccProfile("srgb")
    .png()
    .toBuffer();
  await validateExport(png);
  return { png, layer, warnings, layout, placement: { ...pos, left } };
}
export async function validateExport(input: Buffer) {
  const m = await sharp(input).metadata();
  if (
    m.format !== "png" ||
    m.width !== OUTPUT.width ||
    m.height !== OUTPUT.height ||
    m.hasAlpha ||
    m.space !== "srgb"
  )
    throw new AppError(
      "INVALID_EXPORT",
      "Eksport nie spełnia wymagań PNG 1600 × 1200, sRGB, bez przezroczystości.",
      502,
    );
}
