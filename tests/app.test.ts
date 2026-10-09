import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app";
import {
  DEFAULT_FRAMING,
  DEFAULT_COMPOSITION,
  IMPACT_PRESET,
} from "../src/shared/config";
import { face, gradientFixture, subjectFixture } from "./fixtures";
import { validateExport } from "../src/server/images";
const instances: ReturnType<typeof createApp>[] = [];
afterEach(() => {
  for (const i of instances) i.close();
  instances.length = 0;
  vi.unstubAllEnvs();
});

describe("Codespaces forwarded browser requests", () => {
  function codespaces() {
    vi.stubEnv("CODESPACES", "true");
    vi.stubEnv("CODESPACE_NAME", "test-space");
    vi.stubEnv("PORT", "3001");
    vi.stubEnv("APP_ORIGIN", "https://test-space-3001.app.github.dev");
  }

  it.each(["http://localhost:3001", "http://127.0.0.1:3001"])(
    "accepts a same-origin browser upload forwarded with Origin %s",
    async (origin) => {
      codespaces();
      const i = createApp({
        defaultGradient: await gradientFixture(),
        analysis: {
          analyze: async () => ({ people: 1, faces: [face], warnings: [] }),
        },
      });
      instances.push(i);
      const result = await request(i.app)
        .post("/api/jobs")
        .set("Origin", origin)
        .set("Sec-Fetch-Site", "same-origin")
        .field("name", "Forwarded speaker")
        .field("mode", "transparent")
        .attach("photo", await subjectFixture(), {
          filename: "speaker.png",
          contentType: "image/png",
        })
        .expect(202);
      expect(result.body.id).toBeTruthy();
      expect(result.headers["set-cookie"][0]).toContain("Secure");
    },
  );

  it("rejects external origins, cross-site requests and unrelated loopback ports", async () => {
    codespaces();
    const { i } = setup();
    for (const [origin, site] of [
      ["https://evil.example", "same-origin"],
      ["http://localhost:3001", "cross-site"],
      ["http://localhost:3001", "same-site"],
      ["http://localhost:3001", undefined],
      ["http://localhost:5173", "same-origin"],
      ["https://test-space-3001.app.github.dev", "cross-site"],
    ]) {
      const r = request(i.app)
        .post("/api/gradient")
        .set("Origin", origin!)
        .set("X-Forwarded-Host", "test-space-3001.app.github.dev");
      if (site) r.set("Sec-Fetch-Site", site);
      const response = await r.expect(403);
      expect(response.body.code).toBe("ORIGIN_REJECTED");
    }
  });

  it("keeps the explicit origin check outside Codespaces", async () => {
    codespaces();
    vi.stubEnv("CODESPACES", "false");
    const { client } = setup();
    await client
      .post("/api/gradient")
      .set("Origin", "http://localhost:3001")
      .set("Sec-Fetch-Site", "same-origin")
      .expect(403);
  });
});
function setup(people = 1) {
  const i = createApp({
    analysis: {
      analyze: async () => ({
        people,
        faces: people === 1 ? [face] : [],
        warnings: [],
      }),
    },
    background: { remove: async (input) => input },
  });
  instances.push(i);
  return { i, client: request.agent(i.app) };
}
async function ready(client: ReturnType<typeof request.agent>, id: string) {
  for (let n = 0; n < 100; n++) {
    const r = await client.get(`/api/jobs/${id}`);
    if (["complete", "manual-review-required", "failed"].includes(r.body.state))
      return r.body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Pipeline did not finish");
}
async function upload(client: ReturnType<typeof request.agent>) {
  await client
    .post("/api/gradient")
    .attach("gradient", await gradientFixture(), {
      filename: "background.png",
      contentType: "image/png",
    })
    .expect(200);
  const r = await client
    .post("/api/jobs")
    .field("name", "Anna Żółć")
    .field("mode", "transparent")
    .attach("photo", await subjectFixture(), {
      filename: "photo.png",
      contentType: "image/png",
    })
    .expect(202);
  return r.body.id as string;
}
describe("HTTP speaker workflow", () => {
  it("runs upload → isolation → composition → framing → verified download → deletion", async () => {
    const { client } = setup();
    const id = await upload(client);
    const j = await ready(client, id);
    expect(j.state).toBe("manual-review-required");
    expect(j.warnings.join(" ")).toContain("powiększenia");
    await client
      .post(`/api/jobs/${id}/review`)
      .send({ confirmSinglePerson: true })
      .expect(200);
    expect(j.canvaState).toBe("unconfigured");
    await client
      .get(`/api/jobs/${id}/preview`)
      .expect("Content-Type", /png/)
      .expect(200);
    const modified = await client
      .post(`/api/jobs/${id}/render`)
      .send({
        framing: { ...DEFAULT_FRAMING, x: 25 },
        filters: IMPACT_PRESET,
        composition: DEFAULT_COMPOSITION,
      })
      .expect(200);
    expect(modified.body.revision).toBe(2);
    await client
      .post(`/api/jobs/${id}/review`)
      .send({ confirmSinglePerson: true })
      .expect(200);
    const download = await client.get(`/api/jobs/${id}/download`).expect(200);
    expect(download.headers["content-disposition"]).toContain(
      "impact-speaker-anna-zolc.png",
    );
    await validateExport(download.body);
    await client.delete(`/api/jobs/${id}`).expect(204);
    await client.get(`/api/jobs/${id}`).expect(404);
  });
  it("rejects unsupported files and missing backgrounds", async () => {
    const { client } = setup();
    await client
      .post("/api/jobs")
      .field("name", "speaker")
      .attach("photo", await subjectFixture(), "image.png")
      .expect(400);
    await client
      .post("/api/gradient")
      .attach("gradient", Buffer.from("text"), {
        filename: "x.txt",
        contentType: "text/plain",
      })
      .expect(400);
  });
  it("does not choose a person when multiple people are detected", async () => {
    const { client } = setup(2),
      id = await upload(client);
    const j = await ready(client, id);
    expect(j.state).toBe("manual-review-required");
    expect(j.error.code).toBe("MULTIPLE_PEOPLE");
    expect(j.hasPreview).toBe(false);
    await client.get(`/api/jobs/${id}/download`).expect(409);
    await client
      .post(`/api/jobs/${id}/review`)
      .send({ confirmSinglePerson: true })
      .expect(400);
  });
  it("requires explicit review when no person is confidently detected", async () => {
    const { client } = setup(0),
      id = await upload(client);
    expect((await ready(client, id)).state).toBe("manual-review-required");
    await client
      .post(`/api/jobs/${id}/review`)
      .send({ confirmSinglePerson: false })
      .expect(400);
    await client
      .post(`/api/jobs/${id}/review`)
      .send({ confirmSinglePerson: true })
      .expect(202);
    expect((await ready(client, id)).state).toBe("complete");
  });
  it("keeps images private to their uploading session", async () => {
    const { client, i } = setup(),
      id = await upload(client);
    await ready(client, id);
    await request(i.app).get(`/api/jobs/${id}/preview`).expect(404);
  });
  it("blocks cross-origin mutation and invalid settings", async () => {
    const { client } = setup();
    await client
      .post("/api/gradient")
      .set("Origin", "https://evil.example")
      .expect(403);
    const id = await upload(client);
    await ready(client, id);
    await client
      .post(`/api/jobs/${id}/render`)
      .send({ framing: { zoom: 99 } })
      .expect(400);
  });
  it("reports the missing Canva configuration without failing the local export", async () => {
    const { client } = setup(),
      id = await upload(client);
    await ready(client, id);
    await client
      .post(`/api/jobs/${id}/review`)
      .send({ confirmSinglePerson: true })
      .expect(200);
    const r = await client.post(`/api/jobs/${id}/canva`).expect(503);
    expect(r.body.code).toBe("CANVA_NOT_CONFIGURED");
    await client.get(`/api/jobs/${id}/download`).expect(200);
  });
});

it("keeps the last valid image after rejecting a framing that hides the subject", async () => {
  const { client } = setup(),
    id = await upload(client);
  await ready(client, id);
  await client
    .post(`/api/jobs/${id}/review`)
    .send({ confirmSinglePerson: true })
    .expect(200);
  const before = await client.get(`/api/jobs/${id}`);
  const r = await client
    .post(`/api/jobs/${id}/render`)
    .send({
      framing: { zoom: 0.5, x: 800, y: 0 },
      filters: IMPACT_PRESET,
      composition: { ...DEFAULT_COMPOSITION, targetX: 1600, anchor: "subject" },
    })
    .expect(400);
  expect(r.body.code).toBe("SUBJECT_OUTSIDE");
  const after = await client.get(`/api/jobs/${id}`);
  expect(after.body.state).toBe("complete");
  expect(after.body.revision).toBe(before.body.revision);
  await client.get(`/api/jobs/${id}/download`).expect(200);
});

it("uses the supplied default gradient for a speaker without a background upload", async () => {
  const { readFile } = await import("node:fs/promises");
  const { default: sharp } = await import("sharp");
  const gradient = await readFile(
    new URL("../assets/impact-gradient-1600x1200.png", import.meta.url),
  );
  const i = createApp({
    defaultGradient: gradient,
    analysis: {
      analyze: async () => ({ people: 1, faces: [face], warnings: [] }),
    },
  });
  instances.push(i);
  const client = request.agent(i.app);
  const status = await client.get("/api/status").expect(200);
  expect(status.body.hasGradient).toBe(true);
  expect(status.body.gradientSource).toBe("default");
  const preview = await client.get("/api/gradient/preview").expect(200);
  expect(preview.body).toEqual(gradient);
  const created = await client
    .post("/api/jobs")
    .field("name", "Default gradient")
    .field("mode", "transparent")
    .attach("photo", await subjectFixture(), {
      filename: "subject.png",
      contentType: "image/png",
    })
    .expect(202);
  const id = created.body.id;
  const view = await ready(client, id);
  expect(view.state).toBe("manual-review-required");
  await client
    .post(`/api/jobs/${id}/review`)
    .send({ confirmSinglePerson: true })
    .expect(200);
  const download = await client.get(`/api/jobs/${id}/download`).expect(200);
  await validateExport(download.body);
  const pixel = (input: Buffer) =>
    sharp(input)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
  expect(await pixel(download.body)).toEqual(await pixel(gradient));
});
