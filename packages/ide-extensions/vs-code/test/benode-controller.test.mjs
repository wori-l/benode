import { beforeEach, expect, test, vi } from "vitest";

const testState = vi.hoisted(() => ({
  analysisCalls: [],
  cacheCalls: [],
  analysisFailure: undefined,
  errorMessages: [],
}));

const analysis = {
  discovery: { applications: [], diagnostics: [] },
  fileFacts: [],
  frameworkIndex: {
    applications: [],
    endpoints: [],
    nodes: [],
    edges: [],
    diagnostics: [],
  },
  state: {
    parserId: "spring-java",
    requestFingerprint: "cold-workspace",
    discovery: { applications: [], diagnostics: [] },
    files: [],
  },
  timings: {
    discoveryMs: 0,
    readAndHashMs: 0,
    indexingMs: 0,
    frameworkIndexMs: 0,
    totalMs: 0,
    indexedFiles: 0,
    reusedFiles: 0,
  },
};

vi.mock("vscode", () => ({
  ProgressLocation: { Window: 10 },
  window: {
    async withProgress(_options, task) {
      return task({ report() {} });
    },
    async showErrorMessage(message) {
      testState.errorMessages.push(message);
    },
  },
  workspace: {
    workspaceFolders: [{ uri: { toString: () => "file:///workspace" } }],
    getConfiguration: () => ({
      get: () => [
        { parser: "spring-java", package: "java.*" },
        { parser: "spring-java", package: "javax.*" },
        { parser: "spring-java", package: "jakarta.*" },
        { parser: "spring-java", package: "org.springframework.*" },
      ],
    }),
  },
}));

vi.mock(
  "../src/analysis/cached-workspace-analysis-state.js",
  () => ({
    CachedWorkspaceAnalysisState: class {
      async clear() {
        testState.cacheCalls.push("clear");
      }

      async previous() {
        testState.cacheCalls.push("previous");
        return undefined;
      }

      publish(value) {
        testState.cacheCalls.push(["publish", value]);
      }
    },
  }),
);

vi.mock("../src/analysis/extension-workspace-analyzer.js", () => ({
  ExtensionWorkspaceAnalyzer: class {
    async analyze(workspaceUri, previousState, changes, configuredExclusions) {
      testState.analysisCalls.push({
        workspaceUri,
        previousState,
        changes,
        configuredExclusions,
      });
      if (testState.analysisFailure !== undefined) {
        throw testState.analysisFailure;
      }
      return analysis;
    }

    cancelActiveWorker() {}
    dispose() {}
  },
}));

import { BenodeController } from "../src/benode-controller.js";
import { DiagnosticStore } from "../src/diagnostics/diagnostic-store.js";

beforeEach(() => {
  testState.analysisCalls.length = 0;
  testState.cacheCalls.length = 0;
  testState.errorMessages.length = 0;
  testState.analysisFailure = undefined;
});

function createFixture(currentEndpointId = () => undefined) {
  const provider = { update: vi.fn() };
  const treeView = { message: undefined };
  const output = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    warn: vi.fn(),
  };
  const graphPanel = {
    currentEndpointId,
    showError: vi.fn(),
    showLoading: vi.fn(),
    update: vi.fn(),
  };
  const diagnostics = new DiagnosticStore(output);
  const controller = new BenodeController(
    provider,
    treeView,
    diagnostics,
    graphPanel,
    "/extension",
    "0.1.0",
    { path: "/storage" },
  );
  return { controller, diagnostics, graphPanel, output, provider, treeView };
}

test("Clean and Reindex clears state, publishes loading and starts cold", async () => {
  const fixture = createFixture();

  await fixture.controller.cleanAndReindex();

  expect(fixture.graphPanel.showLoading).toHaveBeenCalledWith(
    "Reindexing endpoint graph…",
  );
  expect(testState.cacheCalls[0]).toBe("clear");
  expect(testState.cacheCalls[1]).toBe("previous");
  expect(testState.analysisCalls).toEqual([{
    workspaceUri: "file:///workspace",
    previousState: undefined,
    changes: undefined,
    configuredExclusions: [
      { parser: "spring-java", package: "java.*" },
      { parser: "spring-java", package: "javax.*" },
      { parser: "spring-java", package: "jakarta.*" },
      { parser: "spring-java", package: "org.springframework.*" },
    ],
  }]);
  expect(testState.cacheCalls[2]).toEqual(["publish", analysis.state]);
  expect(fixture.output.info).toHaveBeenCalledWith(
    "Symbol resolution and graph construction completed.",
    expect.objectContaining({ endpoints: 0, nodes: 0 }),
  );
});

test("a failed update preserves the last catalog and publishes a typed error", async () => {
  const fixture = createFixture();
  await fixture.controller.reindex();
  expect(fixture.provider.update).toHaveBeenCalledTimes(1);

  testState.analysisFailure = new Error("worker stopped");
  await fixture.controller.reindex();

  expect(fixture.provider.update).toHaveBeenCalledTimes(1);
  expect(fixture.treeView.message).toBe(
    "Update failed; showing the last valid analysis.",
  );
  expect(fixture.graphPanel.showError).toHaveBeenCalledWith(
    "analysisFailed",
    expect.stringContaining("last valid graph"),
  );
  expect(fixture.diagnostics.diagnostics()).toContainEqual(
    expect.objectContaining({ code: "BENODE_ANALYSIS_FAILED" }),
  );
});

test("a missing endpoint after reindex keeps the panel and reports it", async () => {
  const fixture = createFixture(() => "missing-endpoint");

  await fixture.controller.reindex();

  expect(fixture.graphPanel.update).not.toHaveBeenCalled();
  expect(fixture.graphPanel.showError).toHaveBeenCalledWith(
    "endpointUnavailable",
    expect.stringContaining("no longer available"),
  );
  expect(fixture.diagnostics.diagnostics()).toContainEqual(
    expect.objectContaining({ code: "BENODE_ENDPOINT_UNAVAILABLE" }),
  );
});
