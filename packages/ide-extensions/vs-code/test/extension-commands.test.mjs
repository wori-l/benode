import { readFile } from "node:fs/promises";

import { beforeEach, expect, test, vi } from "vitest";

const testState = vi.hoisted(() => ({
  cleanCalls: 0,
  configurationHandler: undefined,
  handlers: new Map(),
  outputChannelCalls: [],
  reindexCalls: 0,
}));

function disposable() {
  return { dispose() {} };
}

vi.mock("vscode", () => ({
  commands: {
    registerCommand(command, handler) {
      testState.handlers.set(command, handler);
      return disposable();
    },
  },
  window: {
    createOutputChannel: (...args) => {
      testState.outputChannelCalls.push(args);
      return disposable();
    },
    createTreeView: () => ({
      visible: false,
      onDidChangeVisibility: () => disposable(),
    }),
  },
  workspace: {
    onDidChangeConfiguration: (handler) => {
      testState.configurationHandler = handler;
      return disposable();
    },
    createFileSystemWatcher: () => ({
      ...disposable(),
      onDidChange: () => disposable(),
      onDidCreate: () => disposable(),
      onDidDelete: () => disposable(),
    }),
  },
}));

vi.mock("../src/benode-controller.js", () => ({
  BenodeController: class {
    async cleanAndReindex() {
      testState.cleanCalls += 1;
    }

    ensureIndexed() {}
    openEndpointGraph() {}
    reindex() {
      testState.reindexCalls += 1;
    }
    scheduleFileChange() {}
    showDiagnostics() {}
    dispose() {}
  },
}));

vi.mock("../src/catalog/catalog-tree-provider.js", () => ({
  CatalogTreeProvider: class {
    dispose() {}
  },
}));

vi.mock("../src/webview/endpoint-graph-panel.js", () => ({
  EndpointGraphPanel: class {
    dispose() {}
  },
}));

import { activate } from "../src/extension.js";

beforeEach(() => {
  testState.cleanCalls = 0;
  testState.configurationHandler = undefined;
  testState.handlers.clear();
  testState.outputChannelCalls.length = 0;
  testState.reindexCalls = 0;
});

test("activation registers the contributed Clean and Reindex command", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new globalThis.URL("../package.json", import.meta.url),
      "utf8",
    ),
  );
  const contributedCommands = packageJson.contributes.commands.map(
    (entry) => entry.command,
  );
  expect(contributedCommands).toContain("benode.cleanAndReindexWorkspace");
  expect(
    packageJson.contributes.configuration.properties[
      "benode.excludedPackages"
    ].default,
  ).toEqual([
    { parser: "spring-java", package: "java.*" },
    { parser: "spring-java", package: "javax.*" },
    { parser: "spring-java", package: "jakarta.*" },
    { parser: "spring-java", package: "org.springframework.*" },
    { parser: "spring-java", package: "org.apache.*" },
  ]);

  activate({
    extension: { packageJSON: packageJson },
    extensionUri: { fsPath: "/extension" },
    storageUri: { path: "/storage" },
    subscriptions: [],
  });
  expect(testState.outputChannelCalls).toEqual([
    ["Benode", { log: true }],
  ]);
  const handler = testState.handlers.get("benode.cleanAndReindexWorkspace");
  expect(handler).toBeTypeOf("function");

  await handler();
  expect(testState.cleanCalls).toBe(1);

  testState.configurationHandler({
    affectsConfiguration: (key) => key === "benode.excludedPackages",
  });
  expect(testState.reindexCalls).toBe(1);
});
