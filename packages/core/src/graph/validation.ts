import {
  type EndpointGraph,
  type ResolutionConfidence,
  type SourceLocation,
} from "../contracts/model.js";

export const GRAPH_VALIDATION_CODES = {
  DANGLING_EDGE_SOURCE: "graph.danglingEdgeSource",
  DANGLING_EDGE_TARGET: "graph.danglingEdgeTarget",
  DUPLICATE_EDGE_ID: "graph.duplicateEdgeId",
  DUPLICATE_NODE_ID: "graph.duplicateNodeId",
  EMPTY_EVIDENCE: "graph.emptyEvidence",
  INVALID_CONFIDENCE_CANDIDATE_COUNT:
    "graph.invalidConfidenceCandidateCount",
  INVALID_SOURCE_LOCATION: "graph.invalidSourceLocation",
  INVALID_EDGE_OCCURRENCE_COUNT:
    "graph.invalidEdgeOccurrenceCount",
  INVALID_UNRESOLVED_TERMINAL: "graph.invalidUnresolvedTerminal",
  MISSING_SOURCE_LOCATION: "graph.missingSourceLocation",
} as const;

export type GraphValidationCode =
  (typeof GRAPH_VALIDATION_CODES)[keyof typeof GRAPH_VALIDATION_CODES];

export interface GraphValidationIssue {
  readonly code: GraphValidationCode;
  readonly message: string;
  readonly path: string;
  readonly relatedIds: readonly string[];
}

export interface GraphValidationResult {
  readonly valid: boolean;
  readonly issues: readonly GraphValidationIssue[];
}

function isValidPosition(value: SourceLocation["start"]): boolean {
  return (
    Number.isInteger(value.line) &&
    value.line >= 0 &&
    Number.isInteger(value.column) &&
    value.column >= 0
  );
}

function isLocationOrdered(location: SourceLocation): boolean {
  return (
    location.end.line > location.start.line ||
    (location.end.line === location.start.line &&
      location.end.column >= location.start.column)
  );
}

function isValidSourceLocation(location: SourceLocation): boolean {
  return (
    location.uri.length > 0 &&
    isValidPosition(location.start) &&
    isValidPosition(location.end) &&
    isLocationOrdered(location)
  );
}

function expectedCandidateCount(
  confidence: ResolutionConfidence,
  candidateCount: number,
): boolean {
  switch (confidence) {
    case "ambiguous":
      return Number.isInteger(candidateCount) && candidateCount >= 2;
    case "exact":
    case "inferred":
      return candidateCount === 1;
    case "unresolved":
      return candidateCount === 0;
  }
}

export function validateEndpointGraph(
  graph: EndpointGraph,
): GraphValidationResult {
  const issues: GraphValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoingNodeIds = new Set(graph.edges.map((edge) => edge.sourceNodeId));

  const addIssue = (
    code: GraphValidationCode,
    message: string,
    path: string,
    relatedIds: readonly string[],
  ): void => {
    issues.push({ code, message, path, relatedIds });
  };

  for (const [index, node] of graph.nodes.entries()) {
    const path = "nodes[" + index.toString() + "]";

    if (nodeIds.has(node.id)) {
      addIssue(
        GRAPH_VALIDATION_CODES.DUPLICATE_NODE_ID,
        "Node IDs must be unique.",
        path + ".id",
        [node.id],
      );
    }
    nodeIds.add(node.id);

    if (node.requiresSourceLocation && node.sourceLocation === undefined) {
      addIssue(
        GRAPH_VALIDATION_CODES.MISSING_SOURCE_LOCATION,
        "Navigable nodes must include a source location.",
        path + ".sourceLocation",
        [node.id],
      );
    } else if (
      node.sourceLocation !== undefined &&
      !isValidSourceLocation(node.sourceLocation)
    ) {
      addIssue(
        GRAPH_VALIDATION_CODES.INVALID_SOURCE_LOCATION,
        "Source locations require a URI and ordered zero-based positions.",
        path + ".sourceLocation",
        [node.id],
      );
    }
    if (node.unresolved && outgoingNodeIds.has(node.id)) {
      addIssue(
        GRAPH_VALIDATION_CODES.INVALID_UNRESOLVED_TERMINAL,
        "Unresolved nodes must be terminal.",
        path,
        [node.id],
      );
    }
  }

  for (const [index, edge] of graph.edges.entries()) {
    const path = "edges[" + index.toString() + "]";

    if (edgeIds.has(edge.id)) {
      addIssue(
        GRAPH_VALIDATION_CODES.DUPLICATE_EDGE_ID,
        "Edge IDs must be unique.",
        path + ".id",
        [edge.id],
      );
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.sourceNodeId)) {
      addIssue(
        GRAPH_VALIDATION_CODES.DANGLING_EDGE_SOURCE,
        "Edge source must reference an existing node.",
        path + ".sourceNodeId",
        [edge.id, edge.sourceNodeId],
      );
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      addIssue(
        GRAPH_VALIDATION_CODES.DANGLING_EDGE_TARGET,
        "Edge target must reference an existing node.",
        path + ".targetNodeId",
        [edge.id, edge.targetNodeId],
      );
    }

    if (
      edge.occurrenceCount <= 0 ||
      edge.occurrenceCount !== edge.evidence.length
    ) {
      addIssue(
        GRAPH_VALIDATION_CODES.INVALID_EDGE_OCCURRENCE_COUNT,
        "Edge occurrence count must match its evidence entries.",
        path + ".occurrenceCount",
        [edge.id],
      );
    }
    if (edge.evidence.length === 0) {
      addIssue(
        GRAPH_VALIDATION_CODES.EMPTY_EVIDENCE,
        "Every edge must explain how it was resolved.",
        path + ".evidence",
        [edge.id],
      );
    }

    for (const [evidenceIndex, evidence] of edge.evidence.entries()) {
      const evidencePath =
        path + ".evidence[" + evidenceIndex.toString() + "]";

      if (!expectedCandidateCount(edge.confidence, evidence.candidateCount)) {
        addIssue(
          GRAPH_VALIDATION_CODES.INVALID_CONFIDENCE_CANDIDATE_COUNT,
          "Candidate count is inconsistent with edge confidence.",
          evidencePath + ".candidateCount",
          [edge.id],
        );
      }

      if (
        evidence.sourceLocation !== undefined &&
        !isValidSourceLocation(evidence.sourceLocation)
      ) {
        addIssue(
          GRAPH_VALIDATION_CODES.INVALID_SOURCE_LOCATION,
          "Evidence locations require a URI and ordered zero-based positions.",
          evidencePath + ".sourceLocation",
          [edge.id],
        );
      }
    }
    const targetNode = nodesById.get(edge.targetNodeId);
    if (
      (edge.confidence === "unresolved") !== targetNode?.unresolved
    ) {
      addIssue(
        GRAPH_VALIDATION_CODES.INVALID_UNRESOLVED_TERMINAL,
        "Unresolved edges must target unresolved terminal nodes.",
        path,
        [edge.id, edge.targetNodeId],
      );
    }
  }

  for (const [index, diagnostic] of graph.diagnostics.entries()) {
    if (
      diagnostic.sourceLocation !== undefined &&
      !isValidSourceLocation(diagnostic.sourceLocation)
    ) {
      addIssue(
        GRAPH_VALIDATION_CODES.INVALID_SOURCE_LOCATION,
        "Diagnostic locations require a URI and ordered zero-based positions.",
        "diagnostics[" + index.toString() + "].sourceLocation",
        [diagnostic.code],
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
