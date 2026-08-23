import { describe, expect, it } from "vitest";

import {
  getEndpointGraph,
  validateEndpointGraph,
  type EndpointGraphRequest,
  type FrameworkIndex,
  type GraphEdge,
  type GraphNode,
  type ResolutionConfidence,
  type SourceLocation,
} from "../src/index.js";

const LOCATION: SourceLocation = {
  uri: "file:///workspace/src/main/java/example/Flow.java",
  start: { line: 0, column: 0 },
  end: { line: 1, column: 1 },
};

function node(
  id: string,
  role: string,
): GraphNode {
  return {
    id,
    role,
    filterIds: [role],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    symbol: {
      name: id,
      qualifiedName: "example." + id,
      signature: "example." + id + "#run()",
    },
    sourceLocation: LOCATION,
    metadata: {},
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  confidence: ResolutionConfidence,
): GraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    confidence,
    occurrenceCount: 1,
    evidence: [
      {
        reason: "Graph query fixture.",
        candidateCount:
          confidence === "ambiguous"
            ? 2
            : confidence === "unresolved"
              ? 0
              : 1,
        sourceLocation: LOCATION,
      },
    ],
  };
}

function frameworkIndex(): FrameworkIndex {
  const root = node("root", "controller");

  return {
    applications: [
      {
        id: "application",
        name: "Application",
        rootUri: "file:///workspace",
        sourceRoots: ["file:///workspace/src/main/java"],
        entryPoint: root.symbol,
        sourceLocation: LOCATION,
      },
    ],
    endpoints: [
      {
        id: "endpoint",
        applicationId: "application",
        controllerSymbolId: "controller",
        handlerSymbolId: root.id,
        httpMethods: ["GET"],
        paths: ["/flow"],
        sourceLocation: LOCATION,
      },
    ],
    nodeFilters: ["controller", "service", "helper", "repository"].map(
      (id) => ({ id, label: id, section: "Types", target: "group" as const,
        defaultSelected: true }),
    ),
    nodes: [
      node("repository-alt", "repository"),
      node("isolated", "helper"),
      root,
      node("service", "service"),
      node("helper", "helper"),
      node("repository", "repository"),
    ],
    edges: [
      edge("edge-unrelated", "isolated", "repository", "exact"),
      edge("edge-4b", "helper", "repository-alt", "ambiguous"),
      edge("edge-3", "helper", "service", "exact"),
      edge("edge-dangling", "helper", "missing", "exact"),
      edge("edge-2", "service", "helper", "inferred"),
      edge("edge-4a", "helper", "repository", "ambiguous"),
      edge("edge-1", "root", "service", "exact"),
    ],
    diagnostics: [
      {
        code: "fixture.diagnostic",
        severity: "information",
        message: "A deterministic fixture diagnostic.",
      },
    ],
  };
}

function request(
  overrides: Partial<EndpointGraphRequest> = {},
): EndpointGraphRequest {
  return {
    index: frameworkIndex(),
    endpointId: "endpoint",
    nodeFilters: [],
    confidences: [],
    ...overrides,
  };
}

async function query(
  overrides: Partial<EndpointGraphRequest> = {},
) {
  return getEndpointGraph(request(overrides));
}

describe("getEndpointGraph", () => {
  it("projects every reachable node", async () => {
    const graph = await query();

    expect(graph).toMatchObject({
      applicationId: "application",
      endpointId: "endpoint",
    });
    expect(graph.nodes.map((item) => item.id)).toEqual([
      "helper",
      "repository",
      "repository-alt",
      "root",
      "service",
    ]);
    expect(graph.edges.map((item) => item.id)).toEqual([
      "edge-1",
      "edge-2",
      "edge-3",
      "edge-4a",
      "edge-4b",
    ]);
    expect(graph.diagnostics.map((item) => item.code)).toEqual([
      "fixture.diagnostic",
    ]);
    expect(validateEndpointGraph(graph).valid).toBe(true);
  });

  it("rejects invalid graphs with actionable validation details", () => {
    const index = frameworkIndex();
    const duplicate = index.edges.find((item) => item.id === "edge-1");
    if (duplicate === undefined) {
      throw new Error("The graph fixture has no root edge.");
    }

    expect(() => getEndpointGraph(request({
      index: {
        ...index,
        edges: [...index.edges, duplicate],
      },
    }))).toThrow(
      /graph\.duplicateEdgeId at edges\[\d+\]\.id \[edge-1\]/,
    );
  });

  it("terminates cycles and keeps their back edges", async () => {
    const graph = await query();

    expect(graph.nodes.map((item) => item.id)).toEqual([
      "helper",
      "repository",
      "repository-alt",
      "root",
      "service",
    ]);
    expect(graph.edges.map((item) => item.id)).toEqual([
      "edge-1",
      "edge-2",
      "edge-3",
      "edge-4a",
      "edge-4b",
    ]);
  });

  it("uses empty filter lists as no filter", async () => {
    const graph = await query({
      nodeFilters: [],
      confidences: [],
    });

    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(5);
  });

  it("prunes branches by target role while retaining the endpoint root", async () => {
    const graph = await query({
      nodeFilters: ["service", "helper"],
    });

    expect(graph.nodes.map((item) => item.id)).toEqual([
      "helper",
      "root",
      "service",
    ]);
    expect(graph.edges.map((item) => item.id)).toEqual([
      "edge-1",
      "edge-2",
      "edge-3",
    ]);
  });

  it("prunes edges and their descendants by confidence", async () => {
    const graph = await query({ confidences: ["exact"] });

    expect(graph.nodes.map((item) => item.id)).toEqual([
      "root",
      "service",
    ]);
    expect(graph.edges.map((item) => item.id)).toEqual(["edge-1"]);
  });

  it("returns deterministic ordering independently of index ordering", async () => {
    const index = frameworkIndex();
    const forward = await query({ index });
    const reversed = await query({
      index: {
        ...index,
        nodes: [...index.nodes].reverse(),
        edges: [...index.edges].reverse(),
      },
    });

    expect(reversed).toEqual(forward);
  });

  it("rejects missing endpoint data", async () => {
    await expect(query({ endpointId: "missing" })).rejects.toThrow(
      "Endpoint not found: missing",
    );

    const index = frameworkIndex();
    await expect(
      query({
        index: {
          ...index,
          endpoints: [
            {
              ...index.endpoints[0],
              handlerSymbolId: "missing-handler",
            },
          ],
        },
      }),
    ).rejects.toThrow(
      "Endpoint handler node not found: missing-handler",
    );
  });

  it("excludes nodes and edges owned by another application", async () => {
    const index = frameworkIndex();
    const applicationNodes = index.nodes.map((item) => ({
      ...item,
      metadata: { ...item.metadata, applicationId: "application" },
    }));
    const foreignNode = {
      ...node("foreign-service", "service"),
      metadata: { applicationId: "other-application" },
    };
    const graph = await query({
      index: {
        ...index,
        nodes: [...applicationNodes, foreignNode],
        edges: [
          ...index.edges,
          edge("cross-application", "root", foreignNode.id, "exact"),
        ],
      },
    });

    expect(graph.nodes.some((item) => item.id === foreignNode.id)).toBe(false);
    expect(
      graph.edges.some((item) => item.id === "cross-application"),
    ).toBe(false);
  });

});
