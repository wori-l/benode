import {
  globSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";

import type { FileFacts } from "@benode/core";

import { TreeSitterJavaAdapter } from "../../src/index.js";

export const REPOSITORY_ROOT = resolve(
  import.meta.dirname,
  "../../../../..",
);

export const TEST_SERVICE_ROOT = resolve(
  REPOSITORY_ROOT,
  "fixtures/springboot-srv",
);

const WASM_ROOT = resolve(
  REPOSITORY_ROOT,
  "node_modules/@vscode/tree-sitter-wasm/wasm",
);

const QUERY_ROOT = resolve(
  REPOSITORY_ROOT,
  "packages/parser/spring-java/queries",
);

export async function createJavaTestAdapter(): Promise<TreeSitterJavaAdapter> {
  return TreeSitterJavaAdapter.create({
    runtimeWasmPath: resolve(WASM_ROOT, "tree-sitter.wasm"),
    javaLanguageWasmPath: resolve(
      WASM_ROOT,
      "tree-sitter-java.wasm",
    ),
    declarationsQuery: readFileSync(
      resolve(QUERY_ROOT, "declarations.scm"),
      "utf8",
    ),
    invocationsQuery: readFileSync(
      resolve(QUERY_ROOT, "invocations.scm"),
      "utf8",
    ),
  });
}

export async function indexJavaSnippet(
  adapter: TreeSitterJavaAdapter,
  content: string,
  relativeUri = "src/main/java/com/example/Demo.java",
): Promise<FileFacts> {
  return adapter.indexFile({
    applicationId: "test-application",
    uri: "fixture:///" + relativeUri,
    relativeUri,
    content,
    contentVersion: "test-content",
  });
}

export async function parseTestService(
  adapter: TreeSitterJavaAdapter,
  applicationId = "springboot-srv",
): Promise<readonly FileFacts[]> {
  const results: FileFacts[] = [];

  for (const relativeUri of globSync("src/main/java/**/*.java", {
    cwd: TEST_SERVICE_ROOT,
  }).sort()) {
    results.push(
      await adapter.indexFile({
        applicationId,
        uri: "fixture:///springboot-srv/" + relativeUri,
        relativeUri,
        content: readFileSync(
          resolve(TEST_SERVICE_ROOT, relativeUri),
          "utf8",
        ),
        contentVersion: "test-fixture",
      }),
    );
  }

  return results;
}
