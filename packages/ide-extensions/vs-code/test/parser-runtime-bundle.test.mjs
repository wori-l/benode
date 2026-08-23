import { readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { expect, test } from "vitest";

import { treeSitterNodeRuntimePlugin } from "../scripts/tree-sitter-runtime-plugin.mjs";

const testRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const treeSitterRoot = dirname(require.resolve("@vscode/tree-sitter-wasm"));

test("the bundled parser runtime initializes in a Node 18 CommonJS extension", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "benode-parser-bundle-"));
  const outputPath = resolve(temporaryRoot, "runtime.cjs");

  try {
    await build({
      bundle: true,
      entryPoints: [
        resolve(testRoot, "../../../parser/spring-java/src/runtime.ts"),
      ],
      format: "cjs",
      outfile: outputPath,
      platform: "node",
      plugins: [treeSitterNodeRuntimePlugin()],
      target: "node18",
    });

    const { createJavaParserRuntime } = require(outputPath);
    const queryRoot = resolve(testRoot, "../../../parser/spring-java/queries");
    const runtime = await createJavaParserRuntime({
      runtimeWasmPath: resolve(treeSitterRoot, "tree-sitter.wasm"),
      javaLanguageWasmPath: resolve(
        treeSitterRoot,
        "tree-sitter-java.wasm",
      ),
      declarationsQuery: await readFile(
        resolve(queryRoot, "declarations.scm"),
        "utf8",
      ),
      invocationsQuery: await readFile(
        resolve(queryRoot, "invocations.scm"),
        "utf8",
      ),
    });

    try {
      const tree = runtime.parser.parse("class Example {}");
      expect(tree?.rootNode.type).toBe("program");
      tree?.delete();
    } finally {
      runtime.declarationsQuery.delete();
      runtime.invocationsQuery.delete();
      runtime.parser.delete();
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
