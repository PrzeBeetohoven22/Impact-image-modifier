import { z } from "zod";
export const OUTPUT = { width: 1600, height: 1200 } as const;
export const BACKGROUND_LAYOUT = { left: 0, top: 120, size: 1080 } as const;
export const OUTPUT_FILENAME = "Impact'27 photo.png";
export const HEAD_PROPORTIONS = {
  min: 0.15,
  target: 0.45,
  max: 0.75,
} as const;
export const SUBJECT_TOP = { min: 174, max: 660 } as const;
export const gradientModeSchema = z.enum(["canvas", "cutout"]);
export type GradientMode = z.infer<typeof gradientModeSchema>;
const slider = z.number().min(-100).max(100);
export const filterSchema = z
  .object({
    temperature: slider,
    tint: slider,
    brightness: slider,
    contrast: slider,
    highlights: slider,
    shadows: slider,
    whites: slider,
    blacks: slider,
    vibrance: slider,
    saturation: slider,
    invert: z.boolean(),
    sharpness: z.number().min(0).max(100),
    clarity: slider,
    vignette: z.number().min(0).max(100),
    denoise: z.boolean().default(false),
  })
  .strict();
export type Filters = z.infer<typeof filterSchema>;
// Canva slider values. The local algorithm is an uncalibrated approximation, not Canva's renderer.
export const IMPACT_PRESET: Filters = {
  temperature: 13,
  tint: 0,
  brightness: -8,
  contrast: -12,
  highlights: 3,
  shadows: 6,
  whites: -15,
  blacks: 0,
  vibrance: 15,
  saturation: -63,
  invert: false,
  sharpness: 20,
  clarity: 0,
  vignette: 0,
  denoise: false,
};
export const NEUTRAL_PRESET: Filters = Object.fromEntries(
  Object.keys(IMPACT_PRESET).map((k) => [
    k,
    k === "invert" || k === "denoise" ? false : 0,
  ]),
) as Filters;
export const compositionSchema = z
  .object({
    headTop: z.number().min(SUBJECT_TOP.min).max(SUBJECT_TOP.max),
    subjectRight: z.literal(1224),
    targetBottom: z.literal(1200),
  })
  .strict();
export type Composition = z.infer<typeof compositionSchema>;
// Gradient, right edge and bottom stay fixed; the subject top is adjustable.
export const DEFAULT_COMPOSITION: Composition = {
  headTop: 240,
  subjectRight: 1224,
  targetBottom: 1200,
};
export const framingSchema = z
  .object({
    headRatio: z.number().min(HEAD_PROPORTIONS.min).max(HEAD_PROPORTIONS.max),
    // Original, EXIF-normalized source coordinates; null uses the detector estimate.
    headTop: z.number().min(0).max(40_000).nullable(),
    chin: z.number().min(0).max(40_000).nullable(),
  })
  .strict();
export type Framing = z.infer<typeof framingSchema>;
export const DEFAULT_FRAMING: Framing = {
  headRatio: HEAD_PROPORTIONS.target,
  headTop: null,
  chin: null,
};
export const renderSchema = z
  .object({
    framing: framingSchema,
    filters: filterSchema,
    composition: compositionSchema,
  })
  .strict();
export type RenderSettings = z.infer<typeof renderSchema>;
export type Rect = { x: number; y: number; width: number; height: number };
export type DetectedObject = { label: string; confidence: number; box: Rect };
export type Analysis = {
  people: number;
  faces: Rect[];
  warnings: string[];
  objects?: DetectedObject[];
};
export type ObjectReport = {
  status: "complete" | "limited";
  objects: DetectedObject[];
  message?: string;
};
export type HeadMeasurement = {
  top: number;
  chin: number | null;
  sourceWidth: number;
  sourceHeight: number;
};
export type LayoutMetrics = {
  headTop: number;
  subjectRight: number;
  subjectBottom: number;
  headRatio: number;
  measurement: "estimated" | "manual";
};
export type JobState =
  | "idle"
  | "uploading"
  | "validating"
  | "removing-background"
  | "composing"
  | "detecting-objects"
  | "creating-canva-design"
  | "exporting"
  | "complete"
  | "manual-review-required"
  | "failed";
export type JobView = {
  id: string;
  state: JobState;
  canvaState: "unconfigured" | "pending" | "complete" | "failed";
  warnings: string[];
  error?: { code: string; message: string };
  canvaError?: { code: string; message: string };
  canvaDesign?: { id: string; editUrl: string };
  hasPreview: boolean;
  hasSubject: boolean;
  head?: HeadMeasurement;
  layout?: LayoutMetrics;
  filename: string;
  analysis?: Analysis;
  objectReport?: ObjectReport;
  objectDecision?: "pending" | "accepted" | "declined";
  expiresAt: number;
  revision: number;
};
