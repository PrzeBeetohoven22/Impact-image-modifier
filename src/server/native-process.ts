import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { DetectedObject } from "../shared/config.js";

export type NativeTask = "background" | "objects";
export interface NativeRequest {
  id: number;
  kind: NativeTask;
  image: Buffer;
  modelPath?: string;
}
export interface NativeResponse {
  id: number;
  result?: Buffer | DetectedObject[];
  error?: string;
}
interface NativeResults {
  background: Buffer;
  objects: DetectedObject[];
}

// Child processes have separate native-library address spaces. Worker threads
// would still allow the two incompatible ONNX runtimes to share one process.
export class NativeModelProcess<K extends NativeTask> {
  private child?: ChildProcess;
  private sequence = 0;
  private closed = false;
  private pending?: {
    id: number;
    resolve: (result: NativeResults[K]) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor(
    private kind: K,
    private options: { entry?: URL; timeoutMs?: number } = {},
  ) {}

  private fail(error: Error) {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private start() {
    const entry =
      this.options.entry ??
      new URL(
        import.meta.url.endsWith(".ts")
          ? "./native-worker.ts"
          : "./native-worker.js",
        import.meta.url,
      );
    const child = fork(fileURLToPath(entry), [], {
      serialization: "advanced",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: entry.pathname.endsWith(".ts") ? ["--import", "tsx"] : [],
    });
    this.child = child;
    child.on("message", (response: NativeResponse) => {
      if (this.child !== child || response.id !== this.pending?.id) return;
      const pending = this.pending;
      if (response.error) {
        this.fail(new Error(response.error));
        this.child = undefined;
        child.kill();
        return;
      }
      const valid =
        this.kind === "background"
          ? Buffer.isBuffer(response.result)
          : Array.isArray(response.result);
      if (!valid) {
        this.fail(new Error("Invalid native-model response"));
        this.child = undefined;
        child.kill();
        return;
      }
      clearTimeout(pending.timer);
      this.pending = undefined;
      pending.resolve(response.result as NativeResults[K]);
      // CLI diagnostics can finish naturally; workers exit on IPC disconnect.
      child.unref();
      child.channel?.unref();
    });
    child.on("error", (error) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.fail(error);
      child.kill();
    });
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = undefined;
      if (this.pending) {
        console.error(
          `Model ${this.kind}: proces zakończył się (${signal ?? code}). Serwer pozostaje dostępny.`,
        );
        this.fail(new Error(`Native model exited: ${signal ?? code}`));
      }
    });
    return child;
  }

  async run(image: Buffer, modelPath?: string): Promise<NativeResults[K]> {
    if (this.closed) throw new Error("Native model is closed");
    if (this.pending) throw new Error("Native model is already processing");
    const child = this.child ?? this.start();
    child.ref();
    child.channel?.ref();
    const id = ++this.sequence;
    return new Promise<NativeResults[K]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.child = undefined;
        this.fail(new Error("Native model timed out"));
        child.kill("SIGKILL");
      }, this.options.timeoutMs ?? 120_000);
      this.pending = { id, resolve, reject, timer };
      child.send(
        { id, kind: this.kind, image, modelPath } satisfies NativeRequest,
        (error) => {
          if (error && this.child === child) {
            this.child = undefined;
            this.fail(error);
            child.kill();
          }
        },
      );
    });
  }

  close() {
    this.closed = true;
    this.fail(new Error("Native model is closed"));
    this.child?.kill();
    this.child = undefined;
  }
}
