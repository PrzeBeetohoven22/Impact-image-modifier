import { z } from "zod";
export const OUTPUT = { width: 1600, height: 1200 } as const;
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
};
export const NEUTRAL_PRESET: Filters = Object.fromEntries(
  Object.keys(IMPACT_PRESET).map((k) => [k, k === "invert" ? false : 0]),
) as Filters;
export const compositionSchema = z
  .object({
    targetX: z.number().min(0).max(1600),
    targetBottom: z.number().min(0).max(1200),
    maxSubjectWidth: z.number().min(100).max(1600),
    maxSubjectHeight: z.number().min(100).max(1200),
    faceTargetX: z.number().min(0).max(1600),
    faceTargetY: z.number().min(0).max(1200),
    minimumHeadMargin: z.number().min(0).max(300),
    placementTolerance: z.number().min(0).max(200),
    anchor: z.enum(["subject", "face"]),
    crop: z.enum(["contain", "allow-bottom"]),
  })
  .strict();
export type Composition = z.infer<typeof compositionSchema>;
// Provisional 4:3 framing, adjustable until an approved 4:3 asset is supplied.
export const DEFAULT_COMPOSITION: Composition = {
  targetX: 880,
  targetBottom: 1200,
  maxSubjectWidth: 1120,
  maxSubjectHeight: 1080,
  faceTargetX: 880,
  faceTargetY: 330,
  minimumHeadMargin: 90,
  placementTolerance: 40,
  anchor: "face",
  crop: "allow-bottom",
};
export const framingSchema = z
  .object({
    zoom: z.number().min(0.5).max(2),
    x: z.number().min(-800).max(800),
    y: z.number().min(-600).max(600),
  })
  .strict();
export type Framing = z.infer<typeof framingSchema>;
export const DEFAULT_FRAMING: Framing = { zoom: 1, x: 0, y: 0 };
export const renderSchema = z
  .object({
    framing: framingSchema,
    filters: filterSchema,
    composition: compositionSchema,
  })
  .strict();
export type RenderSettings = z.infer<typeof renderSchema>;
export type Rect = { x: number; y: number; width: number; height: number };
export type Analysis = { people: number; faces: Rect[]; warnings: string[] };
export type JobState =
  | "idle"
  | "uploading"
  | "validating"
  | "removing-background"
  | "composing"
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
  filename: string;
  analysis?: Analysis;
  expiresAt: number;
  revision: number;
};
