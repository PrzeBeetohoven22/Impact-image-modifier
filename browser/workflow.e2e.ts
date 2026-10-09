import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { subjectFixture } from "../tests/fixtures";

async function prepareSpeaker(page: Page) {
  await page.goto("/");
  await page.getByLabel("Wybierz zdjęcie", { exact: true }).setInputFiles({
    name: "subject.png",
    mimeType: "image/png",
    buffer: await subjectFixture(),
  });
  await page
    .getByRole("button", { name: "GENERUJ GRAFIKĘ NA IMPACT'27" })
    .click();
  await expect(page.getByText("PNG gotowy", { exact: true })).toBeVisible({
    timeout: 60000,
  });
}

test("download works without a review checkbox and sliders update automatically", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prepareSpeaker(page);
  await expect(page.getByRole("checkbox", { name: /Sprawdziłem/ })).toHaveCount(
    0,
  );
  await expect(page.locator(".framing-panel input[type=range]")).toHaveCount(2);
  await page
    .getByRole("slider", { name: "WIELKOŚĆ SYLWETKI", exact: true })
    .focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("slider", { name: "WIELKOŚĆ SYLWETKI", exact: true }),
  ).toHaveValue("75");
  await expect(
    page.getByText("Aktualizowanie podglądu…", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  await page
    .getByRole("slider", { name: "WYSOKOŚĆ SYLWETKI", exact: true })
    .focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("slider", { name: "WYSOKOŚĆ SYLWETKI", exact: true }),
  ).toHaveValue("100");
  await expect(
    page.getByText("Aktualizowanie podglądu…", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "POBIERZ PNG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Impact'27 photo.png");
  const image = sharp((await download.path())!);
  const m = await image.metadata();
  expect([m.width, m.height, m.format, m.hasAlpha]).toEqual([
    1600,
    1200,
    "png",
    false,
  ]);
  await page.getByRole("button", { name: "Usuń zdjęcie", exact: true }).click();
  await expect(
    page.getByAltText("Podgląd gotowego kadru prelegenta"),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("desktop first screen contains upload, generation, both sliders, preview and download", async ({
  page,
}) => {
  for (const size of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    for (const locator of [
      page.getByLabel("Wybierz zdjęcie"),
      page.getByRole("button", { name: "GENERUJ GRAFIKĘ NA IMPACT'27" }),
      page.getByRole("button", { name: "POBIERZ PNG", exact: true }),
      page.locator(".preview"),
      page.locator(".framing-panel"),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    }
  }
  await expect(
    page.getByText("Wybrany gradient Impact jest gotowy do użycia.", {
      exact: false,
    }),
  ).toHaveCount(0);
  const file = (await page.getByLabel("Wybierz zdjęcie").boundingBox())!;
  const gradient = (await page
    .getByAltText("Podgląd stałego tła")
    .boundingBox())!;
  expect(gradient.y).toBeGreaterThan(file.y);
  await page.screenshot({ path: "/tmp/impact-kv-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/impact-kv-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("preserves the locked gradient and toggles guides without a checkbox", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".layout-guides")).toHaveCount(0);
  await page.getByRole("button", { name: "Prowadnice", exact: true }).click();
  await expect(page.locator(".layout-guides")).toBeVisible();
  const response = await page.request.get("/api/gradient/preview");
  const image = sharp(await response.body());
  const m = await image.metadata();
  expect([m.width, m.height]).toEqual([1600, 1200]);
  const white = await image
    .extract({ left: 1080, top: 120, width: 520, height: 1080 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(white.every((value) => value === 255)).toBe(true);
});

test("failed advanced measurement retains the valid preview and does not retry endlessly", async ({
  page,
}) => {
  await prepareSpeaker(page);
  await page.getByText("Pomiar głowy: włosy–broda", { exact: true }).click();
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/render")) requests.push(r.url());
  });
  await page
    .getByRole("spinbutton", {
      name: "Spód brody (% wysokości zdjęcia) — wartość",
      exact: true,
    })
    .fill("1");
  await expect(page.locator(".notice.error[role=alert]")).toContainText("brody");
  await expect(
    page.getByAltText("Podgląd gotowego kadru prelegenta"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "POBIERZ PNG", exact: true }),
  ).toBeDisabled();
  await page.waitForTimeout(1500);
  expect(requests).toHaveLength(1);
});

test("shows the object consent notice without blocking download or performing retouch", async ({
  page,
}) => {
  let view: Record<string, unknown>;
  await page.route("**/api/jobs/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    if (body.state === "complete") {
      body.objectReport = {
        status: "complete",
        objects: [
          {
            label: "mikrofon",
            confidence: 0.8,
            box: { x: 300, y: 400, width: 80, height: 150 },
          },
        ],
      };
      body.objectDecision = "pending";
      view = body;
    }
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/jobs/*/object-decision", async (route) => {
    view.objectDecision = route.request().postDataJSON().decision;
    await route.fulfill({ json: view });
  });
  await prepareSpeaker(page);
  await expect(
    page.getByText(
      "WYKRYTO OBIEKT NIE BĘDĄCY SYLWETKĄ, CZY ZGADASZ SIĘ NA RETUSZ PRZY UŻYCIU AI?",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "POBIERZ PNG", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "ZGADZAM SIĘ", exact: true }).click();
  await expect(
    page.getByText(
      "Zgoda zapisana dla tego zdjęcia. Retusz AI nie jest uruchamiany w tej wersji.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "POBIERZ PNG", exact: true }),
  ).toBeEnabled();
});
