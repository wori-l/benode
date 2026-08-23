import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ReadonlyWorkspaceFileSearch,
  ReadonlyWorkspaceFileSystem,
} from "@benode/core";
import {
  SpringWorkspaceAnalyzer,
  TreeSitterJavaAdapter,
} from "../src/index.js";
import { afterAll, beforeAll, bench, describe } from "vitest";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../..");
const WASM_ROOT = resolve(
  REPOSITORY_ROOT,
  "node_modules/@vscode/tree-sitter-wasm/wasm",
);
const QUERY_ROOT = resolve(REPOSITORY_ROOT, "packages/parser/spring-java/queries");
const JAVA_FILE_COUNT = Number.parseInt(
  process.env.BENODE_BENCHMARK_FILES ?? "250",
  10,
);
const BENCHMARK_MODE = process.env.BENODE_BENCHMARK_MODE ?? "quick";
const IS_ACCEPTANCE = BENCHMARK_MODE !== "quick";
const COLD_LIMIT_MS = 15_000;
const UPDATE_LIMIT_MS = 1_000;
const SERVICE_COUNT = JAVA_FILE_COUNT - 2;
const WORKSPACE_URI = "benchmark:///large-maven-workspace/";
const SOURCE_ROOT_URI = new URL(
  "src/main/java/",
  WORKSPACE_URI,
).toString();

async function createBenchmarkLanguageAdapter(): Promise<TreeSitterJavaAdapter> {
  return TreeSitterJavaAdapter.create({
    runtimeWasmPath: resolve(WASM_ROOT, "tree-sitter.wasm"),
    javaLanguageWasmPath: resolve(
      WASM_ROOT,
      "tree-sitter-java.wasm",
    ),
    declarationsQuery: await readFile(
      resolve(QUERY_ROOT, "declarations.scm"),
      "utf8",
    ),
    invocationsQuery: await readFile(
      resolve(QUERY_ROOT, "invocations.scm"),
      "utf8",
    ),
  });
}

function serviceName(index: number): string {
  return "BenchmarkService" + index.toString().padStart(3, "0");
}

function serviceSource(index: number): string {
  const currentName = serviceName(index);
  const nextName = serviceName(index + 1);
  const isTerminal = index === SERVICE_COUNT - 1;

  if (isTerminal) {
    return `package benchmark.service;

import org.springframework.stereotype.Service;

@Service
public class ${currentName} {
  public void run() {}
}
`;
  }

  return `package benchmark.service;

import org.springframework.stereotype.Service;

@Service
public class ${currentName} {
  private final ${nextName} next;

  public ${currentName}(${nextName} next) {
    this.next = next;
  }

  public void run() {
    next.run();
  }
}
`;
}

function benchmarkFiles(): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  files.set(
    new URL("pom.xml", WORKSPACE_URI).toString(),
    "<project><modelVersion>4.0.0</modelVersion></project>",
  );
  files.set(
    new URL("benchmark/BenchmarkApplication.java", SOURCE_ROOT_URI).toString(),
    `package benchmark;

import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BenchmarkApplication {}
`,
  );
  files.set(
    new URL("benchmark/BenchmarkController.java", SOURCE_ROOT_URI).toString(),
    `package benchmark;

import benchmark.service.BenchmarkService000;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BenchmarkController {
  private final BenchmarkService000 service;

  public BenchmarkController(BenchmarkService000 service) {
    this.service = service;
  }

  @GetMapping("/benchmark")
  public void run() {
    service.run();
  }
}
`,
  );

  for (let index = 0; index < SERVICE_COUNT; index += 1) {
    files.set(
      new URL(
        "benchmark/service/" + serviceName(index) + ".java",
        SOURCE_ROOT_URI,
      ).toString(),
      serviceSource(index),
    );
  }

  return files;
}

class BenchmarkWorkspaceFileSystem
  implements ReadonlyWorkspaceFileSystem
{
  readonly #files = new Map(benchmarkFiles());

  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    const rootUri = request.rootUri.endsWith("/")
      ? request.rootUri
      : request.rootUri + "/";

    return [...this.#files.keys()]
      .filter((uri) => uri.startsWith(rootUri))
      .filter((uri) => {
        const relativeUri = uri.slice(rootUri.length);
        if (request.includeGlob === "**/pom.xml") {
          return relativeUri === "pom.xml";
        }
        return (
          request.includeGlob === "**/*.java" &&
          relativeUri.endsWith(".java")
        );
      })
      .sort();
  }

  async readTextFile(uri: string): Promise<string> {
    const content = this.#files.get(uri);
    if (content === undefined) {
      throw new Error("Missing benchmark file: " + uri);
    }
    return content;
  }

  update(uri: string, content: string): void {
    if (!this.#files.has(uri)) {
      throw new Error("Cannot update missing benchmark file: " + uri);
    }
    this.#files.set(uri, content);
  }
}

let languageAdapter: TreeSitterJavaAdapter | undefined;
let fileSystem: BenchmarkWorkspaceFileSystem;
let previousState: Awaited<ReturnType<SpringWorkspaceAnalyzer["analyze"]>>["state"];
let analyzer: SpringWorkspaceAnalyzer;

beforeAll(async () => {
  languageAdapter = await createBenchmarkLanguageAdapter();
  fileSystem = new BenchmarkWorkspaceFileSystem();
  analyzer = new SpringWorkspaceAnalyzer({ fileSystem, languageAdapter });
  if (BENCHMARK_MODE === "updates") {
    previousState = (await analyzer.analyze(analysisRequest())).state;
  }
});

afterAll(() => {
  languageAdapter?.dispose();
});

function analysisRequest() {
  return {

    workspaceUri: WORKSPACE_URI,
    sourceRoots: [],
    excludeGlobs: [],
    includeGeneratedSources: false,
  } as const;
}

function p95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Infinity;
}

function report(value: Readonly<Record<string, unknown>>): void {
  process.stdout.write(
    "\nBENODE_METRIC " + JSON.stringify(value) + "\n",
  );
}

describe.skipIf(BENCHMARK_MODE === "updates")(
  JAVA_FILE_COUNT.toString() + "-file Maven workspace",
  () => {
    bench(
    "discovers, parses, and builds the Spring framework index",
    async () => {
      const started = performance.now();
      const coldAdapter = IS_ACCEPTANCE
        ? await createBenchmarkLanguageAdapter()
        : languageAdapter;
      const analysis = await new SpringWorkspaceAnalyzer({
        fileSystem: new BenchmarkWorkspaceFileSystem(),
        languageAdapter: coldAdapter,
      }).analyze(analysisRequest());
      if (IS_ACCEPTANCE) {
        coldAdapter?.dispose();
      }
      const startupAndAnalysisMs = performance.now() - started;

      if (
        analysis.discovery.applications.length !== 1 ||
        analysis.fileFacts.length !== JAVA_FILE_COUNT ||
        analysis.frameworkIndex.endpoints.length !== 1
      ) {
        throw new Error(
          "The benchmark workspace produced an invalid analysis: " +
            JSON.stringify({
              applications: analysis.discovery.applications.length,
              files: analysis.fileFacts.length,
              endpoints: analysis.frameworkIndex.endpoints.length,
              diagnostics: analysis.discovery.diagnostics.map(
                ({ code, message }) => ({ code, message }),
              ),
            }),
        );
      }
      const publicationStart = performance.now();
      JSON.stringify({
        state: analysis.state,
        frameworkIndex: analysis.frameworkIndex,
      });
      const publicationMs = performance.now() - publicationStart;
      const durationMs = performance.now() - started;
      if (IS_ACCEPTANCE) {
        report({
          kind: "cold",
          files: JAVA_FILE_COUNT,
          startupWasmMs: startupAndAnalysisMs - analysis.timings.totalMs,
          ...analysis.timings,
          publicationMs,
          gatedTotalMs: durationMs,
        });
      }
      if (IS_ACCEPTANCE && durationMs > COLD_LIMIT_MS) {
        throw new Error(
          "Cold analysis exceeded " + COLD_LIMIT_MS.toString() +
            " ms: " + durationMs.toFixed(1) + " ms",
        );
      }
    },
    IS_ACCEPTANCE
      ? {
          iterations: 1,
          time: 1,
          warmupIterations: 0,
          warmupTime: 0,
        }
      : { iterations: 5, time: 1_000 },
    );
  },
);

describe.skipIf(BENCHMARK_MODE !== "updates")(
  "realistic incremental update mix",
  () => {
    bench(
      "applies 80 body, 10 mapping, and 10 signature changes",
      async () => {
        const phaseDurations = {
          discovery: [] as number[],
          readingAndHashing: [] as number[],
          indexing: [] as number[],
          framework: [] as number[],
        };
        const durations: number[] = [];
        const bodyUri = new URL(
          "benchmark/service/BenchmarkService000.java",
          SOURCE_ROOT_URI,
        ).toString();
        const mappingUri = new URL(
          "benchmark/BenchmarkController.java",
          SOURCE_ROOT_URI,
        ).toString();
        const signatureIndex = SERVICE_COUNT - 1;
        const signatureUri = new URL(
          "benchmark/service/" + serviceName(signatureIndex) + ".java",
          SOURCE_ROOT_URI,
        ).toString();

        for (let update = 0; update < 100; update += 1) {
          let uri: string;
          if (update < 80) {
            uri = bodyUri;
            fileSystem.update(
              uri,
              serviceSource(0) + "\n// body-update-" + update.toString(),
            );
          } else if (update < 90) {
            uri = mappingUri;
            fileSystem.update(
              uri,
              benchmarkFiles().get(mappingUri)?.replace(
                "/benchmark",
                "/benchmark-" + update.toString(),
              ) ?? "",
            );
          } else {
            uri = signatureUri;
            fileSystem.update(
              uri,
              serviceSource(signatureIndex).replace(
                "run()",
                "run(int value" + update.toString() + ")",
              ),
            );
          }

          const started = performance.now();
          const analysis = await analyzer.analyze(analysisRequest(), {
            previousState,
            changes: {
              createdOrChangedUris: [uri],
              deletedUris: [],
            },
          });
          JSON.stringify(analysis.frameworkIndex);
          phaseDurations.discovery.push(analysis.timings.discoveryMs);
          phaseDurations.readingAndHashing.push(
            analysis.timings.readAndHashMs,
          );
          phaseDurations.indexing.push(analysis.timings.indexingMs);
          phaseDurations.framework.push(analysis.timings.frameworkIndexMs);
          if (analysis.timings.indexedFiles !== 1) {
            throw new Error("An update did not index exactly one file.");
          }
          previousState = analysis.state;
          durations.push(performance.now() - started + 150);
        }

        const updateP95 = p95(durations);
        report({
          kind: "updates",
          count: durations.length,
          discoveryP95Ms: p95(phaseDurations.discovery),
          readingAndHashingP95Ms: p95(phaseDurations.readingAndHashing),
          indexingP95Ms: p95(phaseDurations.indexing),
          frameworkP95Ms: p95(phaseDurations.framework),
          gatedTotalP95Ms: updateP95,
        });
        if (updateP95 > UPDATE_LIMIT_MS) {
          throw new Error(
            "Incremental update p95 exceeded " + UPDATE_LIMIT_MS.toString() +
              " ms: " + updateP95.toFixed(1) + " ms",
          );
        }
      },
      {
        iterations: 1,
        time: 1,
        warmupIterations: 0,
        warmupTime: 0,
      },
    );
  },
);
