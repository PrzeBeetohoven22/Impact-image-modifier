import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { subjectFixture } from "../tests/fixtures";

async function confirmReview(page: Page) {
  await page.getByRole("checkbox", { name: /Sprawdziłem zdjęcie/ }).check();
  await page.getByRole("button", { name: "Potwierdź i kontynuuj" }).click();
}
async function prepareSpeaker(page: Page, name = "Anna Testowa") {
  await page.goto("/");
  await page.getByLabel("Imię i nazwisko").fill(name);
  await page.getByLabel("Zdjęcie prelegenta", { exact: true }).setInputFiles({
    name: "subject.png",
    mimeType: "image/png",
    buffer: await subjectFixture(),
  });
  await page.getByLabel("Przygotowanie sylwetki").selectOption("transparent");
  await page.getByRole("button", { name: "Przygotuj zdjęcie" }).click();
  await expect(
    page.getByText("Zdjęcie wymaga sprawdzenia", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await confirmReview(page);
  await expect(
    page.getByAltText("Sylwetka do sprawdzenia pomiaru głowy"),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("spinbutton", {
      name: "Spód brody (% wysokości zdjęcia) — wartość",
      exact: true,
    })
    .fill("31.4");
  await page.getByRole("button", { name: "Zastosuj pomiar głowy" }).click();
  await confirmReview(page);
  await expect(page.getByText("PNG gotowy", { exact: true })).toBeVisible();
}

test("manual head measurement, fixed framing, PNG download and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prepareSpeaker(page);
  await page
    .getByRole("spinbutton", {
      name: "Wysokość głowy (% sylwetki) — wartość",
      exact: true,
    })
    .fill("35");
  await expect(
    page.getByRole("link", { name: "Pobierz PNG", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Aktualizuj podgląd/ }).click();
  await confirmReview(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Pobierz PNG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("impact-speaker-anna-testowa.png");
  const image = sharp((await download.path())!);
  const m = await image.metadata();
  expect([m.width, m.height, m.format, m.hasAlpha]).toEqual([
    1600,
    1200,
    "png",
    false,
  ]);
  const top = await image
    .extract({ left: 0, top: 0, width: 1600, height: 120 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(top.every((value) => value === 255)).toBe(true);
  await page.screenshot({ path: "/tmp/impact-ui-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/impact-ui-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Usuń zdjęcie z serwera" }).click();
  await expect(
    page.getByAltText("Podgląd gotowego kadru prelegenta"),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("shows the locked square background and guides before the first upload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Wybrany gradient Impact jest gotowy do użycia.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByAltText("Podgląd stałego tła")).toBeVisible();
  await expect(page.getByLabel("Materiał tła")).toHaveCount(0);
  await expect(page.locator(".layout-guides")).toBeVisible();
  await page.getByRole("checkbox", { name: /Pokaż prowadnice/ }).uncheck();
  await expect(page.locator(".layout-guides")).toHaveCount(0);
  const response = await page.request.get("/api/gradient/preview");
  expect(response.ok()).toBe(true);
  const source = sharp(await response.body());
  const m = await source.metadata();
  expect([m.width, m.height]).toEqual([1600, 1200]);
  const white = await source
    .extract({ left: 1080, top: 120, width: 520, height: 1080 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(white.every((value) => value === 255)).toBe(true);
});

test("rejects a tight head measurement and retains the previous valid preview", async ({
  page,
}) => {
  await prepareSpeaker(page, "Tight source test");
  await page.getByText("Pomiar głowy: włosy–broda", { exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Spód brody (% wysokości zdjęcia) — wartość",
      exact: true,
    })
    .fill("90");
  await page.getByRole("button", { name: "Zastosuj pomiar głowy" }).click();
  await expect(page.getByRole("alert")).toContainText("45%");
  await expect(
    page.getByAltText("Podgląd gotowego kadru prelegenta"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Pobierz PNG", exact: true }),
  ).toHaveCount(0);
});
