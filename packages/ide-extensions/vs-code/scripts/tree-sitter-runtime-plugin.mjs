import { readFile } from "node:fs/promises";

const TREE_SITTER_RUNTIME =
  /[\\/]@vscode[\\/]tree-sitter-wasm[\\/]wasm[\\/]tree-sitter\.js$/;

// VS Code's CommonJS extension loader cannot execute the dynamic Node imports
// emitted by this Emscripten runtime. Keep the replacement scoped to its
// builtin imports so browser-oriented loading behavior remains unchanged.
const NODE_IMPORT_REPLACEMENTS = [
  [
    'const fs2 = await import("fs/promises");',
    'const fs2 = require("fs/promises");',
  ],
  [
    'const { createRequire } = await import("module");\n' +
      '      var require = createRequire(getCurrentScriptUrl());',
    'const { createRequire } = require("module");\n' +
      '      var nodeRequire = createRequire(getCurrentScriptUrl());',
  ],
  ['var fs = require("fs");', 'var fs = nodeRequire("fs");'],
  ['var nodePath = require("path");', 'var nodePath = nodeRequire("path");'],
  [
    'scriptDirectory = require("url").fileURLToPath(',
    'scriptDirectory = nodeRequire("url").fileURLToPath(',
  ],
];

function replaceRequiredSource(contents, source, replacement) {
  if (!contents.includes(source)) {
    throw new Error(
      `Unable to prepare the Tree-sitter runtime: expected source was not found: ${source}`,
    );
  }

  return contents.replace(source, replacement);
}

export function treeSitterNodeRuntimePlugin() {
  return {
    name: "tree-sitter-node-runtime",
    setup(build) {
      build.onLoad({ filter: TREE_SITTER_RUNTIME }, async ({ path }) => {
        let contents = await readFile(path, "utf8");
        for (const [source, replacement] of NODE_IMPORT_REPLACEMENTS) {
          contents = replaceRequiredSource(contents, source, replacement);
        }

        return { contents, loader: "js" };
      });
    },
  };
}
