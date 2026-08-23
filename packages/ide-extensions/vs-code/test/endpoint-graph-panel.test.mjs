import { beforeEach, expect, test, vi } from "vitest";

const testState = vi.hoisted(() => ({
  createPanelCalls: 0,
  openDocumentFailure: undefined,
  openDocuments: [],
  panels: [],
  shownDocuments: [],
}));

function uri(value) {
  return {
    path: value,
    fsPath: value,
    toString: () => value,
  };
}

vi.mock("vscode", () => ({
  ProgressLocation: { Window: 10 },
  Range: function Range(startLine, startColumn, endLine, endColumn) {
    return {
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn },
    };
  },
  TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
  Uri: {
    joinPath(base, ...parts) {
      return uri([base.path, ...parts].join("/"));
    },
    parse(value) {
      return uri(value);
    },
  },
  ViewColumn: { One: 1, Beside: 2 },
  workspace: {
    async openTextDocument(documentUri) {
      if (testState.openDocumentFailure !== undefined) {
        throw testState.openDocumentFailure;
      }
      testState.openDocuments.push(documentUri.toString());
      return { uri: documentUri };
    },
  },
  window: {
    createWebviewPanel() {
      testState.createPanelCalls += 1;
      const state = { receive: undefined, dispose: undefined };
      const panel = {
        title: "",
        reveal: vi.fn(),
        dispose: vi.fn(),
        webview: {
          cspSource: "vscode-webview:",
          html: "",
          asWebviewUri: (value) => value,
          postMessage: vi.fn(async () => true),
          onDidReceiveMessage(listener) {
            state.receive = listener;
            return { dispose() {} };
          },
        },
        onDidDispose(listener) {
          state.dispose = listener;
          return { dispose() {} };
        },
        state,
      };
      testState.panels.push(panel);
      return panel;
    },
    async showErrorMessage() {},
    async showTextDocument(document, options) {
      const editor = { revealRange: vi.fn() };
      testState.shownDocuments.push({ document, options, editor });
      return editor;
    },
  },
}));

import { DiagnosticStore } from "../src/diagnostics/diagnostic-store.js";
import { EndpointGraphPanel } from "../src/webview/endpoint-graph-panel.js";

const location = {
  uri: "file:///workspace/DemoController.java",
  start: { line: 4, column: 2 },
  end: { line: 8, column: 3 },
};

function graphMessage(endpointId = "endpoint") {
  return {
    type: "showEndpointGraph",
    endpoint: {
      id: endpointId,
      applicationId: "app",
      controllerSymbolId: "controller",
      handlerSymbolId: "handler",
      httpMethods: ["GET"],
      paths: ["/demo"],
      sourceLocation: location,
    },
    graph: {
      applicationId: "app",
      endpointId,
      nodeFilters: [],
      nodes: [{
        id: "handler",
        role: "controller",
        filterIds: [],
        groupNode: false,
        requiresSourceLocation: true,
        unresolved: false,
        symbol: {
          name: "demo",
          qualifiedName: "example.DemoController#demo",
          signature: "example.DemoController#demo()",
        },
        sourceLocation: location,
        metadata: {},
      }],
      edges: [],
      diagnostics: [],
    },
  };
}

function fixture() {
  const output = {
    error: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    warn: vi.fn(),
  };
  const diagnostics = new DiagnosticStore(output);
  const panel = new EndpointGraphPanel(uri("/extension"), diagnostics);
  return { diagnostics, output, panel };
}

beforeEach(() => {
  testState.createPanelCalls = 0;
  testState.openDocumentFailure = undefined;
  testState.openDocuments.length = 0;
  testState.panels.length = 0;
  testState.shownDocuments.length = 0;
});

test("reuses the panel and orders handshake lifecycle", async () => {
  const { panel } = fixture();
  const graph = graphMessage();
  await panel.show(graph);
  const vscodePanel = testState.panels[0];

  expect(testState.createPanelCalls).toBe(1);
  expect(vscodePanel.webview.postMessage).not.toHaveBeenCalled();
  vscodePanel.state.receive({ type: "ready" });
  await vi.waitFor(() => {
    expect(vscodePanel.webview.postMessage).toHaveBeenCalledWith(graph);
  });

  panel.showLoading("Reindexing endpoint graph…");
  panel.showError("analysisFailed", "Refresh failed.");
  await panel.show(graphMessage("endpoint-2"));

  expect(testState.createPanelCalls).toBe(1);
  expect(vscodePanel.webview.postMessage.mock.calls.map(([message]) => message.type))
    .toEqual([
      "showEndpointGraph",
      "endpointGraphLoading",
      "endpointGraphError",
      "showEndpointGraph",
    ]);
});

test("rejects malformed or forged intents and navigates from host-owned data", async () => {
  const { diagnostics, panel } = fixture();
  await panel.show(graphMessage());
  const vscodePanel = testState.panels[0];
  vscodePanel.state.receive({ type: "ready" });

  vscodePanel.state.receive({
    type: "navigateToSource",
    nodeId: "handler",
    uri: "file:///forged.java",
  });
  vscodePanel.state.receive({
    type: "navigateToSource",
    nodeId: "forged",
  });
  await vi.waitFor(() => {
    expect(diagnostics.diagnostics()).toContainEqual(
      expect.objectContaining({ code: "BENODE_WEBVIEW_INVALID_MESSAGE" }),
    );
  });
  expect(testState.openDocuments).toEqual([]);

  vscodePanel.state.receive({
    type: "navigateToSource",
    nodeId: "handler",
  });
  await vi.waitFor(() => {
    expect(testState.openDocuments).toEqual([location.uri]);
  });
  expect(testState.shownDocuments[0].options).toMatchObject({
    preserveFocus: false,
    preview: false,
    viewColumn: 1,
  });

  testState.openDocumentFailure = new Error("document unavailable");
  vscodePanel.state.receive({
    type: "navigateToSource",
    nodeId: "handler",
  });
  await vi.waitFor(() => {
    expect(diagnostics.diagnostics()).toContainEqual(
      expect.objectContaining({ code: "BENODE_SOURCE_NAVIGATION_FAILED" }),
    );
  });
});
