import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env, execPath, exit, stdout } from "node:process";

const benchmarkRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(benchmarkRoot, "..");
const repositoryRoot = resolve(packageRoot, "../../..");
const vitestEntry = resolve(
  repositoryRoot,
  "node_modules/vitest/vitest.mjs",
);

function run(label, cwd, args, environment = {}) {
  stdout.write("\n[" + label + "]\n");
  const result = spawnSync(execPath, args, {
    cwd,
    env: { ...env, ...environment },
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    exit(result.status ?? 1);
  }
}

const workspaceBenchmark = [
  vitestEntry,
  "bench",
  "--run",
  "benchmark/workspace-analysis.bench.ts",
];

// Each cold sample gets a fresh process and therefore a fresh Wasm runtime.
// The synthetic filesystem represents an empty Benode cache by construction.
for (let sample = 1; sample <= 3; sample += 1) {
  run(
    "cold " + sample.toString() + "/3",
    packageRoot,
    workspaceBenchmark,
    {
      BENODE_BENCHMARK_FILES: "5000",
      BENODE_BENCHMARK_MODE: "cold",
    },
  );
}

run("100 incremental updates", packageRoot, workspaceBenchmark, {
  BENODE_BENCHMARK_FILES: "5000",
  BENODE_BENCHMARK_MODE: "updates",
});
