import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { buildExtensionBundle } from "../scripts/extension-bundle.mjs";

const testRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(testRoot, "..");
const repositoryRoot = resolve(extensionRoot, "../../..");
const require = createRequire(import.meta.url);

test("the Node 18 CommonJS extension bundle loads without dynamic imports or global Web Crypto", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "benode-extension-bundle-"));
  const outputPath = resolve(temporaryRoot, "extension.cjs");
  const vscodeModuleRoot = resolve(
    temporaryRoot,
    "node_modules",
    "vscode",
  );

  try {
    await mkdir(vscodeModuleRoot, { recursive: true });
    await writeFile(
      resolve(vscodeModuleRoot, "index.js"),
      "module.exports = {};\n",
      "utf8",
    );
    await buildExtensionBundle({
      extensionRoot,
      outputPath,
      repositoryRoot,
    });

    const bundle = await readFile(outputPath, "utf8");
    expect(bundle).not.toMatch(/\bimport\s*\(/u);

    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    try {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: undefined,
        writable: true,
      });
      const extension = require(outputPath);
      expect(extension.activate).toBeTypeOf("function");
      expect(extension.deactivate).toBeTypeOf("function");
      expect(globalThis.crypto.subtle).toBeDefined();
    } finally {
      if (cryptoDescriptor === undefined) {
        delete globalThis.crypto;
      } else {
        Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
      }
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
