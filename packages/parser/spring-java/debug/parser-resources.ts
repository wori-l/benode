import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TreeSitterJavaAdapter } from "../src/index.js";

const require = createRequire(import.meta.url);
const PACKAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export async function createDebugLanguageAdapter(): Promise<TreeSitterJavaAdapter> {
  const treeSitterEntry = require.resolve(
    "@vscode/tree-sitter-wasm",
  );
  const wasmRoot = dirname(treeSitterEntry);
  const queryRoot = resolve(PACKAGE_ROOT, "queries");
  const [declarationsQuery, invocationsQuery] = await Promise.all([
    readFile(resolve(queryRoot, "declarations.scm"), "utf8"),
    readFile(resolve(queryRoot, "invocations.scm"), "utf8"),
  ]);

  return TreeSitterJavaAdapter.create({
    runtimeWasmPath: resolve(wasmRoot, "tree-sitter.wasm"),
    javaLanguageWasmPath: resolve(
      wasmRoot,
      "tree-sitter-java.wasm",
    ),
    declarationsQuery,
    invocationsQuery,
  });
}
