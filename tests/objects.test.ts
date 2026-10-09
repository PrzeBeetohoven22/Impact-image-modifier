import { expect, it } from "vitest";
import { LocalObjectDetection, retainedObjects } from "../src/server/objects";
import { subjectFixture } from "./fixtures";

it("keeps an object in the cutout and discards objects in removed background", async () => {
  const objects = [
    {
      label: "laptop",
      confidence: 0.8,
      box: { x: 110, y: 400, width: 100, height: 100 },
    },
    {
      label: "chair",
      confidence: 0.8,
      box: { x: 0, y: 0, width: 60, height: 300 },
    },
    {
      label: "phone",
      confidence: 0.8,
      box: { x: -50, y: -50, width: 20, height: 20 },
    },
  ];
  expect(
    (await retainedObjects(await subjectFixture(), objects)).map(
      (o) => o.label,
    ),
  ).toEqual(["laptop"]);
});

it("reports reduced capability honestly when the additional local model is missing", async () => {
  const provider = new LocalObjectDetection(
    ".runtime/test-missing-object-model",
  );
  const report = await provider.detect(await subjectFixture(), [
    {
      label: "laptop",
      confidence: 0.8,
      box: { x: 110, y: 400, width: 100, height: 100 },
    },
    {
      label: "tie",
      confidence: 0.8,
      box: { x: 200, y: 240, width: 50, height: 100 },
    },
  ]);
  expect(report.status).toBe("limited");
  expect(report.objects.map((o) => o.label)).toEqual(["laptop"]);
  expect(report.message).toContain("nie jest dostępne");
});
