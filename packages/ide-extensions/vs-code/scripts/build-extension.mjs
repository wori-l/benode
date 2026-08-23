import { copyFile, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAnalysisWorkerBundle,
  buildExtensionBundle,
} from "./extension-bundle.mjs";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptRoot, "..");
const repositoryRoot = resolve(extensionRoot, "../../..");
const outputRoot = resolve(extensionRoot, "dist");
const parserAssetRoot = resolve(outputRoot, "parser-assets");
const webviewAssetRoot = resolve(outputRoot, "webview-assets");
const thirdPartyLicenseRoot = resolve(outputRoot, "licenses");
const nodeModulesRoot = resolve(repositoryRoot, "node_modules");
const springQueryRoot = resolve(extensionRoot, "../../parser/spring-java/queries");
const webviewAssetSourceRoot = resolve(
  extensionRoot,
  "../../ui/graph-view/dist",
);
const bundledLicenseFiles = [
  ["@vue-flow/core/LICENSE", "LICENSE.vue-flow.txt"],
  ["@vueuse/core/LICENSE", "LICENSE.vueuse.txt"],
  [
    "@vueuse/core/node_modules/vue-demi/LICENSE",
    "LICENSE.vue-demi.txt",
  ],
  ["d3-color/LICENSE", "LICENSE.d3-color.txt"],
  ["d3-drag/LICENSE", "LICENSE.d3.txt"],
  ["d3-ease/LICENSE", "LICENSE.d3-ease.txt"],
  ["elkjs/LICENSE.md", "LICENSE.elkjs.md"],
  ["vue/LICENSE", "LICENSE.vue.txt"],
];
const require = createRequire(import.meta.url);
const treeSitterRoot = dirname(require.resolve("@vscode/tree-sitter-wasm"));

await rm(outputRoot, { force: true, recursive: true });
await Promise.all([
  mkdir(parserAssetRoot, { recursive: true }),
  mkdir(thirdPartyLicenseRoot, { recursive: true }),
  mkdir(webviewAssetRoot, { recursive: true }),
]);

await Promise.all([
  buildExtensionBundle({
    extensionRoot,
    outputPath: resolve(outputRoot, "extension.cjs"),
    repositoryRoot,
  }),
  buildAnalysisWorkerBundle({
    extensionRoot,
    outputPath: resolve(outputRoot, "analysis-worker.cjs"),
    repositoryRoot,
  }),
]);

await Promise.all([
  copyFile(
    resolve(treeSitterRoot, "tree-sitter.wasm"),
    resolve(parserAssetRoot, "tree-sitter.wasm"),
  ),
  copyFile(
    resolve(treeSitterRoot, "tree-sitter-java.wasm"),
    resolve(parserAssetRoot, "tree-sitter-java.wasm"),
  ),
  copyFile(
    resolve(treeSitterRoot, "../LICENSE"),
    resolve(parserAssetRoot, "LICENSE.tree-sitter-wasm.txt"),
  ),
  copyFile(
    resolve(springQueryRoot, "declarations.scm"),
    resolve(parserAssetRoot, "declarations.scm"),
  ),
  copyFile(
    resolve(springQueryRoot, "invocations.scm"),
    resolve(parserAssetRoot, "invocations.scm"),
  ),
  copyFile(
    resolve(webviewAssetSourceRoot, "webview.js"),
    resolve(webviewAssetRoot, "webview.js"),
  ),
  copyFile(
    resolve(webviewAssetSourceRoot, "webview.css"),
    resolve(webviewAssetRoot, "webview.css"),
  ),
  ...bundledLicenseFiles.map(([source, target]) =>
    copyFile(
      resolve(nodeModulesRoot, source),
      resolve(thirdPartyLicenseRoot, target),
    )),
]);
