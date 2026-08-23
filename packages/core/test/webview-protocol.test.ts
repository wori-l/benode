import {
  parseHostToWebviewMessage,
  parseWebviewToHostMessage,
  type EndpointGraphErrorMessage,
  type EndpointGraphLoadingMessage,
  type ShowEndpointGraphMessage,
  type SourceLocation,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const location: SourceLocation = {
  uri: "file:///workspace/DemoController.java",
  start: { line: 4, column: 2 },
  end: { line: 8, column: 3 },
};

function graphMessage(): ShowEndpointGraphMessage {
  return {
    type: "showEndpointGraph",
    endpoint: {
      id: "endpoint",
      applicationId: "app",
      controllerSymbolId: "controller",
      handlerSymbolId: "handler",
      httpMethods: ["GET"],
      paths: ["/demo"],
      sourceLocation: location,
    },
    graph: {
      applicationId: "app",
      endpointId: "endpoint",
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

describe("webview protocol", () => {
  it("accepts valid graph and lifecycle messages", () => {
    const loading: EndpointGraphLoadingMessage = {
      type: "endpointGraphLoading",
      message: "Reindexing endpoint graph…",
    };
    const error: EndpointGraphErrorMessage = {
      type: "endpointGraphError",
      code: "analysisFailed",
      message: "The endpoint graph could not be refreshed.",
    };

    expect(parseHostToWebviewMessage(graphMessage())).toEqual(graphMessage());
    expect(parseHostToWebviewMessage(loading)).toEqual(loading);
    expect(parseHostToWebviewMessage(error)).toEqual(error);
  });

  it("rejects incompatible, malformed and unknown host messages", () => {
    expect(parseHostToWebviewMessage(null)).toBeNull();
    expect(parseHostToWebviewMessage({
      ...graphMessage(),
      graph: { ...graphMessage().graph, endpointId: "another-endpoint" },
    })).toBeNull();
    expect(parseHostToWebviewMessage({
      ...graphMessage(),
      graph: {
        ...graphMessage().graph,
        nodes: graphMessage().graph.nodes.map((node) => ({
          ...node, role: "",
        })),
      },
    })).toBeNull();
    expect(parseHostToWebviewMessage({
      ...graphMessage(),
      graph: {
        ...graphMessage().graph,
        nodes: graphMessage().graph.nodes.map((node) => ({
          ...node, filterIds: ["undeclared"],
        })),
      },
    })).toBeNull();
    expect(parseHostToWebviewMessage({
      ...graphMessage(),
      graph: {
        ...graphMessage().graph,
        edges: [{
          id: "invalid-count",
          sourceNodeId: "handler",
          targetNodeId: "handler",
          confidence: "exact",
          occurrenceCount: 0,
          evidence: [{
            reason: "Protocol validation fixture.",
            candidateCount: 1,
          }],
        }],
      },
    })).toBeNull();
    expect(parseHostToWebviewMessage({
      ...graphMessage(),
      unexpected: true,
    })).toBeNull();
    expect(parseHostToWebviewMessage({
      type: "endpointGraphLoading",
      message: " ",
    })).toBeNull();
    expect(parseHostToWebviewMessage({
      type: "endpointGraphError",
      code: "invented",
      message: "Failure",
    })).toBeNull();
  });

  it("accepts only exact known webview intents", () => {
    expect(parseWebviewToHostMessage({
      type: "ready",
    })).toMatchObject({ type: "ready" });
    expect(parseWebviewToHostMessage({
      type: "navigateToSource",
      nodeId: "handler",
    })).toMatchObject({ type: "navigateToSource", nodeId: "handler" });
    expect(parseWebviewToHostMessage({
      type: "navigateToSource",
      nodeId: "",
    })).toBeNull();
    expect(parseWebviewToHostMessage({
      type: "ready",
      unexpected: true,
    })).toBeNull();
    expect(parseWebviewToHostMessage({
      type: "deleteSource",
      nodeId: "handler",
    })).toBeNull();
  });
});
