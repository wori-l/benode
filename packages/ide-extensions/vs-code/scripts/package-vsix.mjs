import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(extensionRoot, "../../..");
const manifest = JSON.parse(
  await readFile(resolve(extensionRoot, "package.json"), "utf8"),
);
const outputPath = resolve(
  repositoryRoot,
  `${manifest.displayName.toLowerCase()}-${manifest.version}.vsix`,
);
const executable = process.platform === "win32" ? "vsce.cmd" : "vsce";

const child = spawn(
  executable,
  [
    "package",
    "--no-dependencies",
    "--out",
    outputPath,
  ],
  { cwd: extensionRoot, stdio: "inherit" },
);

child.on("error", (error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
