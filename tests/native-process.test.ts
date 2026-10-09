import { afterEach, expect, it } from "vitest";
import { NativeModelProcess } from "../src/server/native-process";

const workers: NativeModelProcess<"background">[] = [];
function worker(timeoutMs = 2000) {
  const w = new NativeModelProcess("background", {
    entry: new URL("./native-worker-fixture.mjs", import.meta.url),
    timeoutMs,
  });
  workers.push(w);
  return w;
}
afterEach(() => {
  for (const w of workers) w.close();
  workers.length = 0;
});

it("isolates a genuine SIGSEGV and restarts the model for the next photo", async () => {
  const w = worker();
  const firstPid = Number((await w.run(Buffer.from("ok"))).toString());
  expect(firstPid).not.toBe(process.pid);
  await expect(w.run(Buffer.from("crash"))).rejects.toThrow("SIGSEGV");
  const nextPid = Number((await w.run(Buffer.from("ok"))).toString());
  expect(nextPid).not.toBe(firstPid);
  expect(nextPid).not.toBe(process.pid);
});

it("terminates a stalled model without blocking the next photo", async () => {
  const w = worker(500);
  const firstPid = Number((await w.run(Buffer.from("ok"))).toString());
  await expect(w.run(Buffer.from("hang"))).rejects.toThrow("timed out");
  const nextPid = Number((await w.run(Buffer.from("ok"))).toString());
  expect(nextPid).not.toBe(firstPid);
});

it("cancels outstanding inference when the application closes", async () => {
  const w = worker();
  await w.run(Buffer.from("ok"));
  const request = w.run(Buffer.from("hang"));
  const rejected = expect(request).rejects.toThrow("closed");
  w.close();
  await rejected;
  await expect(w.run(Buffer.from("ok"))).rejects.toThrow("closed");
});
