import { describe, expect, it } from "vitest";

import {
  GRAPH_VALIDATION_CODES,
  validateEndpointGraph,
  type EndpointGraph,
  type GraphNode,
  type SourceLocation,
} from "../src/index.js";

const SOURCE_LOCATION: SourceLocation = {
  uri: "file:///workspace/src/OrderController.java",
  start: { line: 0, column: 0 },
  end: { line: 8, column: 1 },
};

function createNode(
  id: string,
  role: GraphNode["role"],
): GraphNode {
  return {
    id,
    role,
    filterIds: [],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    symbol: {
      name: id,
      qualifiedName: "com.example." + id,
      signature: "com.example." + id + "#run()",
    },
    sourceLocation: SOURCE_LOCATION,
    metadata: {},
  };
}

function createValidGraph(): EndpointGraph {
  return {
    applicationId: "orders-app",
    endpointId: "endpoint",
    nodeFilters: [],
    nodes: [
      createNode("endpoint", "controller"),
      createNode("service", "service"),
    ],
    edges: [
      {
        id: "endpoint-calls-service",
        sourceNodeId: "endpoint",
        targetNodeId: "service",
        confidence: "exact",
        occurrenceCount: 1,
        evidence: [
          {
            reason: "Unique method with matching receiver and signature.",
            candidateCount: 1,
            sourceLocation: SOURCE_LOCATION,
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function issueCodes(graph: EndpointGraph): readonly string[] {
  return validateEndpointGraph(graph).issues.map((issue) => issue.code);
}

describe("validateEndpointGraph", () => {
  it("accepts a valid graph", () => {
    expect(validateEndpointGraph(createValidGraph())).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("reports duplicate node and edge IDs", () => {
    const graph = createValidGraph();

    expect(
      issueCodes({
        ...graph,
        nodes: [...graph.nodes, graph.nodes[0]],
        edges: [...graph.edges, graph.edges[0]],
      }),
    ).toEqual(
      expect.arrayContaining([
        GRAPH_VALIDATION_CODES.DUPLICATE_NODE_ID,
        GRAPH_VALIDATION_CODES.DUPLICATE_EDGE_ID,
      ]),
    );
  });

  it("reports dangling source and target references", () => {
    const graph = createValidGraph();
    const edge = graph.edges[0];

    expect(
      issueCodes({
        ...graph,
        edges: [
          {
            ...edge,
            sourceNodeId: "missing-source",
            targetNodeId: "missing-target",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        GRAPH_VALIDATION_CODES.DANGLING_EDGE_SOURCE,
        GRAPH_VALIDATION_CODES.DANGLING_EDGE_TARGET,
      ]),
    );
  });

  it("reports missing and invalid source locations", () => {
    const graph = createValidGraph();
    const endpoint = graph.nodes[0];
    const service = graph.nodes[1];

    expect(
      issueCodes({
        ...graph,
        nodes: [
          { ...endpoint, sourceLocation: undefined },
          {
            ...service,
            sourceLocation: {
              ...SOURCE_LOCATION,
              start: { line: 4, column: 0 },
              end: { line: 3, column: 0 },
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        GRAPH_VALIDATION_CODES.MISSING_SOURCE_LOCATION,
        GRAPH_VALIDATION_CODES.INVALID_SOURCE_LOCATION,
      ]),
    );
  });

  it("reports confidence and candidate-count mismatches", () => {
    const graph = createValidGraph();
    const edge = graph.edges[0];

    expect(
      issueCodes({
        ...graph,
        edges: [
          {
            ...edge,
            confidence: "exact",
            evidence: [
              {
                reason: "Two overloads remain.",
                candidateCount: 2,
              },
            ],
          },
        ],
      }),
    ).toContain(
      GRAPH_VALIDATION_CODES.INVALID_CONFIDENCE_CANDIDATE_COUNT,
    );
  });

  it("reports occurrence counts inconsistent with evidence", () => {
    const graph = createValidGraph();
    const edge = graph.edges[0];

    expect(
      issueCodes({
        ...graph,
        edges: [{
          ...edge,
          occurrenceCount: 2,
        }],
      }),
    ).toContain(GRAPH_VALIDATION_CODES.INVALID_EDGE_OCCURRENCE_COUNT);
  });


  it("reports malformed unresolved terminals without throwing", () => {
    const graph = createValidGraph();
    const edge = graph.edges[0];

    expect(
      issueCodes({
        ...graph,
        edges: [
          {
            ...edge,
            confidence: "unresolved",
            evidence: [
              {
                reason: "No target could be resolved.",
                candidateCount: 0,
              },
            ],
          },
        ],
      }),
    ).toContain(GRAPH_VALIDATION_CODES.INVALID_UNRESOLVED_TERMINAL);
  });
});

describe("graph serialization", () => {
  it("preserves a graph in a JSON round trip", () => {
    const graph = createValidGraph();
    const parsed = JSON.parse(JSON.stringify(graph)) as EndpointGraph;

    expect(parsed).toEqual(graph);
    expect(validateEndpointGraph(parsed).valid).toBe(true);
  });
});
