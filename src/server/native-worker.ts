import {
  detectObjectsLocally,
  removeBackgroundLocally,
} from "./native-models.js";
import type { NativeRequest, NativeResponse } from "./native-process.js";

let busy = false;
let kind: NativeRequest["kind"] | undefined;
process.on("disconnect", () => process.exit(0));
process.on("message", async (request: NativeRequest) => {
  if (busy || (kind && kind !== request.kind)) {
    process.send?.({
      id: request.id,
      error: "Invalid native-model task",
    } satisfies NativeResponse);
    return;
  }
  kind = request.kind;
  busy = true;
  try {
    const result =
      request.kind === "background"
        ? await removeBackgroundLocally(request.image)
        : await detectObjectsLocally(request.image, request.modelPath!);
    process.send?.({ id: request.id, result } satisfies NativeResponse);
  } catch {
    process.send?.({
      id: request.id,
      error: "Local model inference failed",
    } satisfies NativeResponse);
  } finally {
    busy = false;
  }
});
