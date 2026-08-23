import { parentPort } from "node:worker_threads";

import type { FileFacts } from "@benode/core";

import { createTechnologyWorkerRuntime } from "./worker-technology.js";
import type { TechnologyWorkerRuntime } from "./technology-analysis.js";
import {
  type AnalysisWorkerRequest,
  type AnalysisWorkerResponse,
  type AnalysisWorkerResult,
} from "./worker-protocol.js";

const port = parentPort;
if (port === null) {
  throw new Error("The analysis worker requires a parent port.");
}

const activePort = port;
let runtime: TechnologyWorkerRuntime | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handle(
  request: AnalysisWorkerRequest,
): Promise<AnalysisWorkerResult> {
  switch (request.type) {
    case "initialize":
      runtime?.dispose();
      runtime = await createTechnologyWorkerRuntime(
        request.parserId,
        request.parserAssetRoot,
      );
      return { type: "initialized" };
    case "index": {
      if (runtime === undefined) {
        throw new Error("The analysis worker is not initialized.");
      }
      const facts: FileFacts[] = [];
      for (const item of request.requests) {
        facts.push(await runtime.indexFile(item));
      }
      return { type: "indexed", facts };
    }
    case "build":
      if (runtime === undefined) {
        throw new Error("The analysis worker is not initialized.");
      }
      return {
        type: "built",
        index: await runtime.buildIndex(
          request.request,
          request.excludedPackages,
        ),
      };
  }
}

async function processRequest(request: AnalysisWorkerRequest): Promise<void> {
  try {
    const result = await handle(request);
    const response: AnalysisWorkerResponse = {
      id: request.id,
      ok: true,
      result,
    };
    activePort.postMessage(response);
  } catch (error: unknown) {
    const response: AnalysisWorkerResponse = {
      id: request.id,
      ok: false,
      error: errorMessage(error),
    };
    activePort.postMessage(response);
  }
}

let queue = Promise.resolve();
activePort.on("message", (value: AnalysisWorkerRequest) => {
  if (typeof value.id !== "number") {
    return;
  }
  queue = queue.then(() => processRequest(value));
});
