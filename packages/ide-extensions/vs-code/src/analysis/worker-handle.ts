import { Worker } from "node:worker_threads";

import {
  isWorkerResponse,
  type AnalysisWorkerCommand,
  type AnalysisWorkerResult,
} from "./worker-protocol.js";

export class WorkerHandle {
  readonly #worker: Worker;
  readonly #pending = new Map<
    number,
    {
      readonly resolve: (result: AnalysisWorkerResult) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  #nextId = 1;

  constructor(workerPath: string) {
    this.#worker = new Worker(workerPath);
    this.#worker.on("message", (value: unknown) => {
      if (!isWorkerResponse(value)) {
        return;
      }
      const pending = this.#pending.get(value.id);
      if (pending === undefined) {
        return;
      }
      this.#pending.delete(value.id);
      if (!value.ok || value.result === undefined) {
        pending.reject(new Error(value.error ?? "Analysis worker failed."));
      } else {
        pending.resolve(value.result);
      }
    });
    this.#worker.on("error", (error: unknown) => this.#rejectAll(
      error instanceof Error ? error : new Error(String(error)),
    ));
    this.#worker.on("exit", (code) => {
      if (code !== 0) {
        this.#rejectAll(
          new Error("Analysis worker exited with code " + code.toString()),
        );
      }
    });
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }

  call(command: AnalysisWorkerCommand): Promise<AnalysisWorkerResult> {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.#pending.set(id, { resolve: resolvePromise, reject });
      this.#worker.postMessage({
        ...command,
        id,
      });
    });
  }

  async terminate(): Promise<void> {
    await this.#worker.terminate();
  }
}
