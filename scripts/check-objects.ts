import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { LocalObjectDetection } from "../src/server/objects.js";

const image = process.argv[2]
  ? await readFile(process.argv[2])
  : await sharp({
      create: { width: 400, height: 400, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
const report = await new LocalObjectDetection().detect(image, []);
if (report.status !== "complete")
  throw new Error(
    "Dodatkowy model nie wykonał inferencji. Najpierw uruchom npm run setup:objects i sprawdź jego wynik.",
  );
console.info("Lokalny model obiektów: załadowany, inferencja zakończona.");
console.info(JSON.stringify(report.objects));
