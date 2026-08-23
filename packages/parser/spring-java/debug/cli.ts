import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { analyzeService } from "./service-analysis.js";
import { renderTextReport } from "./text-report.js";

const USAGE = [
  "Usage:",
  "  npm run debug:service -- <service-path> [--json]",
  "",
  "Options:",
  "  --json  Print the complete analysis payload as JSON.",
  "  --help  Show this help.",
].join("\n");

interface CliArguments {
  readonly servicePath: string;
  readonly json: boolean;
}

function parseArguments(args: readonly string[]): CliArguments | null {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) {
    return null;
  }
  if (positionals.length !== 1) {
    throw new Error("Exactly one service path is required.");
  }

  return {
    servicePath: resolve(process.cwd(), positionals[0] ?? ""),
    json: values.json,
  };
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed === null) {
    console.log(USAGE);
    return;
  }

  const serviceStats = await stat(parsed.servicePath);
  if (!serviceStats.isDirectory()) {
    throw new Error(
      "Service path is not a directory: " + parsed.servicePath,
    );
  }

  const analysis = await analyzeService(parsed.servicePath);
  console.log(
    parsed.json
      ? JSON.stringify(analysis, null, 2)
      : renderTextReport(analysis),
  );

  if (analysis.discovery.applications.length === 0) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : String(error);
  console.error("Spring/Java debug failed: " + message);
  console.error(USAGE);
  process.exitCode = 1;
});
