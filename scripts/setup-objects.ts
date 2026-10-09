import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetch, EnvHttpProxyAgent } from "undici";
import {
  OBJECT_MODEL_PATH,
  OBJECT_MODEL_REVISION,
} from "../src/server/objects.js";

type FileRecord = {
  name: string;
  hash: string;
  algorithm: "sha256" | "git-blob";
};
type Manifest = { repository: string; revision: string; files: FileRecord[] };
const repository = "Xenova/owlvit-base-patch32";
const required = [
  "config.json",
  "preprocessor_config.json",
  "tokenizer_config.json",
  "tokenizer.json",
  "onnx/model_quantized.onnx",
];
const optional = [
  "special_tokens_map.json",
  "vocab.json",
  "merges.txt",
  "README.md",
  "LICENSE",
];
function digest(data: Buffer, algorithm: FileRecord["algorithm"]) {
  return algorithm === "sha256"
    ? createHash("sha256").update(data).digest("hex")
    : createHash("sha1")
        .update(`blob ${data.length}\0`)
        .update(data)
        .digest("hex");
}
async function installed() {
  try {
    const manifest: Manifest = JSON.parse(
      await readFile(
        resolve(OBJECT_MODEL_PATH, "impact-model-manifest.json"),
        "utf8",
      ),
    );
    if (
      manifest.repository !== repository ||
      manifest.revision !== OBJECT_MODEL_REVISION ||
      required.some((name) => !manifest.files.some((f) => f.name === name))
    )
      return false;
    for (const file of manifest.files) {
      if (![...required, ...optional].includes(file.name)) return false;
      if (
        digest(
          await readFile(resolve(OBJECT_MODEL_PATH, file.name)),
          file.algorithm,
        ) !== file.hash
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
if (await installed()) {
  console.info("Model obiektów: pliki obecne, sumy kontrolne poprawne.");
} else {
  const dispatcher = new EnvHttpProxyAgent();
  let temporary: string | undefined;
  try {
    const response = await fetch(
      `https://huggingface.co/api/models/${repository}/revision/${OBJECT_MODEL_REVISION}?blobs=true`,
      { dispatcher, signal: AbortSignal.timeout(60_000) },
    );
    if (!response.ok) throw new Error(`Hugging Face: HTTP ${response.status}`);
    const metadata = (await response.json()) as {
      sha: string;
      siblings: {
        rfilename: string;
        blobId?: string;
        lfs?: { sha256: string };
      }[];
    };
    if (metadata.sha !== OBJECT_MODEL_REVISION)
      throw new Error("Brak poprawnej rewizji modelu.");
    await mkdir(dirname(OBJECT_MODEL_PATH), { recursive: true });
    temporary = await mkdtemp(
      resolve(dirname(OBJECT_MODEL_PATH), "owlvit-download-"),
    );
    const manifest: Manifest = {
      repository,
      revision: metadata.sha,
      files: [],
    };
    for (const name of [...required, ...optional]) {
      const entry = metadata.siblings.find((f) => f.rfilename === name);
      if (!entry) {
        if (required.includes(name))
          throw new Error(`Brak pliku modelu: ${name}`);
        continue;
      }
      const algorithm = entry.lfs ? "sha256" : "git-blob";
      const hash = entry.lfs?.sha256 ?? entry.blobId;
      if (!hash) throw new Error(`Brak sumy kontrolnej: ${name}`);
      console.info(`Pobieranie modelu: ${name}`);
      const download = await fetch(
        `https://huggingface.co/${repository}/resolve/${metadata.sha}/${name}`,
        { dispatcher, signal: AbortSignal.timeout(600_000) },
      );
      if (!download.ok)
        throw new Error(`Pobieranie ${name}: HTTP ${download.status}`);
      const data = Buffer.from(await download.arrayBuffer());
      if (digest(data, algorithm) !== hash)
        throw new Error(`Niepoprawna suma kontrolna: ${name}`);
      await mkdir(dirname(resolve(temporary, name)), { recursive: true });
      await writeFile(resolve(temporary, name), data);
      manifest.files.push({ name, algorithm, hash });
    }
    await writeFile(
      resolve(temporary, "impact-model-manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    await rm(OBJECT_MODEL_PATH, { recursive: true, force: true });
    await rename(temporary, OBJECT_MODEL_PATH);
    temporary = undefined;
    console.info(
      "Model obiektów pobrany i zweryfikowany. Zdjęcia nie były wysyłane.",
    );
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    await dispatcher.close();
  }
}
