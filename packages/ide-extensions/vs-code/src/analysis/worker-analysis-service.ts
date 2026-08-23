import { cpus } from "node:os";
import { resolve } from "node:path";

import type {
  FileFactIndexer,
  FileFactIndexOptions,
  FileFacts,
  FrameworkAdapter,
  FrameworkBuildRequest,
  FrameworkIndex,
  IndexFileRequest,
} from "@benode/core";

import { WorkerHandle } from "./worker-handle.js";

const BATCH_SIZE = 32;

function compatiblePrevious(request: IndexFileRequest): FileFacts | undefined {
  const previous = request.previousFacts;
  return previous !== undefined &&
    previous.applicationId === request.applicationId &&
    previous.uri === request.uri &&
    previous.relativeUri === request.relativeUri &&
    previous.contentVersion === request.contentVersion
    ? previous
    : undefined;
}

export class WorkerAnalysisService
  implements FileFactIndexer, FrameworkAdapter
{
  readonly #workerPath: string;
  readonly #parserAssetRoot: string;
  readonly #parserId: string;
  readonly #workerCount: number;
  #workers: readonly WorkerHandle[] = [];
  #initializing: Promise<readonly WorkerHandle[]> | undefined;
  #disposing: Promise<void> | undefined;

  constructor(
    extensionRootPath: string,
    parserId: string,
    workerCount?: number,
  ) {
    this.#workerPath = resolve(
      extensionRootPath,
      "dist",
      "analysis-worker.cjs",
    );
    this.#parserAssetRoot = resolve(
      extensionRootPath,
      "dist",
      "parser-assets",
    );
    this.#parserId = parserId;
    this.#workerCount =
      workerCount ?? Math.min(4, Math.max(1, cpus().length - 1));
  }

  async #ensureWorkers(): Promise<readonly WorkerHandle[]> {
    if (this.#workers.length > 0) {
      return this.#workers;
    }
    if (this.#initializing === undefined) {
      const workers = Array.from(
        { length: this.#workerCount },
        () => new WorkerHandle(this.#workerPath),
      );
      this.#initializing = Promise.all(
        workers.map(async (handle) => {
          const result = await handle.call({
            type: "initialize",
            parserId: this.#parserId,
            parserAssetRoot: this.#parserAssetRoot,
          });
          if (result.type !== "initialized") {
            throw new Error(
              "Unexpected analysis worker initialization result.",
            );
          }
          return handle;
        }),
      ).then((initializedWorkers) => {
        this.#workers = initializedWorkers;
        this.#initializing = undefined;
        return initializedWorkers;
      }).catch(async (error: unknown) => {
        await Promise.allSettled(
          workers.map((worker) => worker.terminate()),
        );
        this.#initializing = undefined;
        throw error;
      });
    }
    return this.#initializing;
  }

  async indexFiles(
    requests: readonly IndexFileRequest[],
    options: FileFactIndexOptions = {},
  ): Promise<readonly FileFacts[]> {
    options.signal?.throwIfAborted();
    const output: (FileFacts | undefined)[] = new Array(requests.length);
    const pending = requests
      .map((request, index) => ({ request, index }))
      .filter(({ request, index }) => {
        const previous = compatiblePrevious(request);
        if (previous === undefined) {
          return true;
        }
        output[index] = previous;
        options.onFileIndexed?.();
        return false;
      });
    if (pending.length === 0) {
      return output.filter(
        (facts): facts is FileFacts => facts !== undefined,
      );
    }

    const workers = await this.#ensureWorkers();
    const batches = Array.from(
      { length: Math.ceil(pending.length / BATCH_SIZE) },
      (_, index) =>
        pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
    );
    const abort = () => {
      // Synchronous Wasm cannot observe a message until its current parse ends;
      // terminating the pool prevents stale work from blocking the next run.
      void this.dispose();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      // Batches may complete in any order. Each result is written to its
      // original request slot, so worker scheduling never changes the index.
      await Promise.all(
        batches.map(async (batch, index) => {
          const worker = workers[index % workers.length];
          if (worker === undefined) {
            throw new Error("No analysis worker is available.");
          }
          const result = await worker.call({
            type: "index",
            requests: batch.map((item) => item.request),
          });
          if (result.type !== "indexed") {
            throw new Error("Unexpected analysis worker indexing result.");
          }
          result.facts.forEach((facts, resultIndex) => {
            const target = batch[resultIndex];
            if (target !== undefined) {
              output[target.index] = facts;
              options.onFileIndexed?.();
            }
          });
        }),
      );
      options.signal?.throwIfAborted();
      return output.map((facts) => {
        if (facts === undefined) {
          throw new Error("An analysis worker omitted a file result.");
        }
        return facts;
      });
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async buildIndex(
    request: FrameworkBuildRequest,
    excludedPackages?: readonly string[],
  ): Promise<FrameworkIndex> {
    const worker = (await this.#ensureWorkers())[0];
    if (worker === undefined) {
      throw new Error("No analysis worker is available.");
    }
    const result = await worker.call({
      type: "build",
      request,
      excludedPackages,
    });
    if (result.type !== "built") {
      throw new Error("Unexpected analysis worker build result.");
    }
    return result.index;
  }

  async #disposeWorkers(): Promise<void> {
    const activeWorkers = this.#workers;
    const initializing = this.#initializing;
    this.#workers = [];
    this.#initializing = undefined;
    const startingWorkers = await initializing?.catch(
      () => [] as readonly WorkerHandle[],
    ) ?? [];
    // Initialization may finish after cancellation. Collect both snapshots so
    // no Tree-sitter parser or worker thread outlives the owning service.
    const workers = new Set([
      ...activeWorkers,
      ...startingWorkers,
      ...this.#workers,
    ]);
    this.#workers = [];
    await Promise.all([...workers].map((worker) => worker.terminate()));
  }

  dispose(): Promise<void> {
    const operation = this.#disposing ??= this.#disposeWorkers();
    return operation.finally(() => {
      if (this.#disposing === operation) {
        this.#disposing = undefined;
      }
    });
  }
}
