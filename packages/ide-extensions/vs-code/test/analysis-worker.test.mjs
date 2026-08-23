import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, expect, test } from "vitest";

import { buildAnalysisWorkerBundle } from "../scripts/extension-bundle.mjs";
import { WorkerAnalysisService } from "../src/analysis/worker-analysis-service.js";

const testRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(testRoot, "..");
const repositoryRoot = resolve(extensionRoot, "../../..");
let temporaryRoot;

function request(index) {
  const name = "WorkerType" + index.toString().padStart(3, "0");
  const uri = "worker:///src/" + name + ".java";
  return {
    applicationId: "worker-application",
    uri,
    relativeUri: "src/" + name + ".java",
    content: `package worker;

public class ${name} {
  public void run() {}
}
`,
    contentVersion: "worker-test-" + index.toString(),
  };
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "benode-worker-test-"));
  const outputRoot = resolve(temporaryRoot, "dist");
  const assetRoot = resolve(outputRoot, "parser-assets");
  const wasmRoot = resolve(
    repositoryRoot,
    "node_modules/@vscode/tree-sitter-wasm/wasm",
  );
  const queryRoot = resolve(
    repositoryRoot,
    "packages/parser/spring-java/queries",
  );
  await mkdir(assetRoot, { recursive: true });
  await Promise.all([
    copyFile(
      resolve(wasmRoot, "tree-sitter.wasm"),
      resolve(assetRoot, "tree-sitter.wasm"),
    ),
    copyFile(
      resolve(wasmRoot, "tree-sitter-java.wasm"),
      resolve(assetRoot, "tree-sitter-java.wasm"),
    ),
    copyFile(
      resolve(queryRoot, "declarations.scm"),
      resolve(assetRoot, "declarations.scm"),
    ),
    copyFile(
      resolve(queryRoot, "invocations.scm"),
      resolve(assetRoot, "invocations.scm"),
    ),
    buildAnalysisWorkerBundle({
      extensionRoot,
      outputPath: resolve(outputRoot, "analysis-worker.cjs"),
      repositoryRoot,
    }),
  ]);
});

afterAll(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

test("worker batches retain request order and support cancellation", async () => {
  const service = new WorkerAnalysisService(
    temporaryRoot,
    "spring-java",
    2,
  );
  try {
    // More than one 32-file batch lets workers finish independently. Results
    // still have to follow request order, never completion order.
    const requests = Array.from({ length: 65 }, (_, index) => request(index));
    const indexing = service.indexFiles(requests);
    let hostTurnObserved = false;
    await new Promise((resolvePromise) => {
      globalThis.setImmediate(() => {
        hostTurnObserved = true;
        resolvePromise();
      });
    });
    expect(hostTurnObserved).toBe(true);
    const facts = await indexing;
    expect(facts.map((item) => item.uri)).toEqual(
      requests.map((item) => item.uri),
    );

    const abortController = new globalThis.AbortController();
    abortController.abort();
    await expect(
      service.indexFiles([request(100)], {
        signal: abortController.signal,
      }),
    ).rejects.toThrow();
  } finally {
    await service.dispose();
  }
});

test("compatible previous facts bypass worker startup", async () => {
  const service = new WorkerAnalysisService(
    "/missing-extension-root",
    "spring-java",
    1,
  );
  const producer = new WorkerAnalysisService(
    temporaryRoot,
    "spring-java",
    1,
  );
  const indexed = await producer.indexFiles([request(200)]);
  await producer.dispose();
  const previous = indexed[0];
  expect(previous).toBeDefined();
  const reused = await service.indexFiles([
    { ...request(200), previousFacts: previous },
  ]);
  expect(reused[0]).toEqual(previous);
  await service.dispose();
});
