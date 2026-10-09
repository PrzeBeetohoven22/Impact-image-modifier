import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { subjectFixture, gradientFixture } from "../tests/fixtures";
test("upload, manual review, framing, download and image deletion in the browser", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Zdjęcia prelegentów" }),
  ).toBeVisible();
  await page.getByLabel("Zatwierdzone tło 1600 × 1200").setInputFiles({
    name: "test-background.png",
    mimeType: "image/png",
    buffer: await gradientFixture(),
  });
  await expect(page.getByText("Tło wgrane.", { exact: false })).toBeVisible();
  await page.getByLabel("Imię i nazwisko").fill("Anna Testowa");
  await page.getByLabel("Zdjęcie prelegenta", { exact: true }).setInputFiles({
    name: "test-subject.png",
    mimeType: "image/png",
    buffer: await subjectFixture(),
  });
  await page.getByLabel("Przygotowanie sylwetki").selectOption("transparent");
  await page.getByRole("button", { name: "Przygotuj zdjęcie" }).click();
  await expect(
    page.getByText("Zdjęcie wymaga sprawdzenia", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("checkbox", { name: /Sprawdziłem zdjęcie/ }).check();
  await page.getByRole("button", { name: "Potwierdź i kontynuuj" }).click();
  await expect(page.getByText("PNG gotowy", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByAltText("Podgląd gotowego kadru prelegenta"),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Pozycja pozioma — wartość", exact: true })
    .fill("70");
  await expect(
    page.getByRole("button", { name: /Aktualizuj podgląd/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Aktualizuj podgląd/ }).click();
  await expect(
    page.getByText("Zdjęcie wymaga sprawdzenia", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Sprawdziłem zdjęcie/ }).check();
  await page.getByRole("button", { name: "Potwierdź i kontynuuj" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Pobierz PNG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("impact-speaker-anna-testowa.png");
  const path = await download.path();
  expect(path).toBeTruthy();
  const m = await sharp(path!).metadata();
  expect([m.width, m.height, m.format, m.hasAlpha]).toEqual([
    1600,
    1200,
    "png",
    false,
  ]);
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

test("imports a gradient cutout and previews it without its black margins", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Materiał tła").selectOption("cutout");
  const source = await sharp(
    Buffer.from(
      '<svg width="900" height="900"><rect width="900" height="900" fill="black"/><rect x="150" y="100" width="600" height="600" fill="#ff0055"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  await page.getByLabel("Plik wycinka gradientu").setInputFiles({
    name: "cutout.png",
    mimeType: "image/png",
    buffer: source,
  });
  await expect(page.getByText("Tło wgrane.", { exact: false })).toBeVisible();
  const preview = page.getByAltText("Podgląd tła po imporcie");
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((image) => [
        (image as HTMLImageElement).naturalWidth,
        (image as HTMLImageElement).naturalHeight,
      ]),
    )
    .toEqual([1600, 1200]);
  const response = await page.request.get("/api/gradient/preview");
  expect(response.ok()).toBe(true);
  const pixel = await sharp(await response.body())
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...pixel]).toEqual([255, 0, 85]);
});

test("shows the selected default gradient and prepares a speaker without uploading a background", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Wybrany gradient Impact jest gotowy do użycia.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByAltText("Podgląd tła po imporcie")).toBeVisible();
  await page.getByLabel("Imię i nazwisko").fill("Default speaker");
  await page
    .getByLabel("Zdjęcie prelegenta", { exact: true })
    .setInputFiles({
      name: "subject.png",
      mimeType: "image/png",
      buffer: await subjectFixture(),
    });
  await page.getByLabel("Przygotowanie sylwetki").selectOption("transparent");
  await expect(
    page.getByRole("button", { name: "Przygotuj zdjęcie" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Przygotuj zdjęcie" }).click();
  await expect(
    page.getByText("Zdjęcie wymaga sprawdzenia", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("checkbox", { name: /Sprawdziłem zdjęcie/ }).check();
  await page.getByRole("button", { name: "Potwierdź i kontynuuj" }).click();
  await expect(
    page.getByRole("link", { name: "Pobierz PNG", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const href = await page
    .getByRole("link", { name: "Pobierz PNG", exact: true })
    .getAttribute("href");
  const output = await page.request.get(href!);
  expect(output.ok()).toBe(true);
  const metadata = await sharp(await output.body()).metadata();
  expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([
    1600,
    1200,
    false,
  ]);
  await page.getByRole("button", { name: "Usuń zdjęcie z serwera" }).click();
});
