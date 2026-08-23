import { resolve } from "node:path";

import { build } from "esbuild";

import { treeSitterNodeRuntimePlugin } from "./tree-sitter-runtime-plugin.mjs";

async function buildNodeBundle({
  entryPoint,
  external,
  outputPath,
  repositoryRoot,
}) {
  await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    entryPoints: [entryPoint],
    ...(external === undefined ? {} : { external }),
    format: "cjs",
    legalComments: "none",
    minify: true,
    outfile: outputPath,
    platform: "node",
    plugins: [treeSitterNodeRuntimePlugin()],
    target: "node18",
  });
}

export async function buildExtensionBundle({
  extensionRoot,
  outputPath,
  repositoryRoot,
}) {
  await buildNodeBundle({
    entryPoint: resolve(extensionRoot, "src/extension.ts"),
    external: ["vscode"],
    outputPath,
    repositoryRoot,
  });
}

export async function buildAnalysisWorkerBundle({
  extensionRoot,
  outputPath,
  repositoryRoot,
}) {
  await buildNodeBundle({
    entryPoint: resolve(
      extensionRoot,
      "src/analysis/analysis-worker.ts",
    ),
    outputPath,
    repositoryRoot,
  });
}
