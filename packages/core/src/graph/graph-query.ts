import type { EndpointGraphRequest } from "../contracts/contracts.js";
import {
  type EndpointGraph,
  type GraphEdge,
  type GraphNode,
} from "../contracts/model.js";
import { validateEndpointGraph } from "./validation.js";

function allowed<T>(filter: ReadonlySet<T>, value: T): boolean {
  return filter.size === 0 || filter.has(value);
}

function nodeAllowed(
  selectedFilters: ReadonlySet<string>,
  node: GraphNode,
): boolean {
  return selectedFilters.size === 0 || node.filterIds.every(
    (filterId) => selectedFilters.has(filterId),
  );
}

function outgoingEdges(
  edges: readonly GraphEdge[],
): ReadonlyMap<string, readonly GraphEdge[]> {
  const result = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    const outgoing = result.get(edge.sourceNodeId) ?? [];
    outgoing.push(edge);
    result.set(edge.sourceNodeId, outgoing);
  }

  for (const outgoing of result.values()) {
    outgoing.sort((left, right) => left.id.localeCompare(right.id));
  }
  return result;
}

export function getEndpointGraph(
  request: EndpointGraphRequest,
): EndpointGraph {
  const endpoint = request.index.endpoints.find(
    (candidate) => candidate.id === request.endpointId,
  );
  if (endpoint === undefined) {
    throw new Error("Endpoint not found: " + request.endpointId);
  }

  const allNodesById = new Map(
    request.index.nodes.map((node) => [node.id, node]),
  );
  const unscopedRoot = allNodesById.get(endpoint.handlerSymbolId);
  const hasApplicationMetadata =
    typeof unscopedRoot?.metadata["applicationId"] === "string";
  const applicationNodes = request.index.nodes.filter(
    (node) =>
      !hasApplicationMetadata ||
      node.metadata["applicationId"] === endpoint.applicationId,
  );
  const nodesById = new Map(
    applicationNodes.map((node) => [node.id, node]),
  );
  const root = nodesById.get(endpoint.handlerSymbolId);
  if (root === undefined) {
    throw new Error(
      "Endpoint handler node not found: " + endpoint.handlerSymbolId,
    );
  }

  const nodeFilter = new Set(request.nodeFilters);
  const confidenceFilter = new Set(request.confidences);
  const applicationEdges = request.index.edges.filter(
    (edge) =>
      nodesById.has(edge.sourceNodeId) &&
      nodesById.has(edge.targetNodeId),
  );
  const outgoingByNode = outgoingEdges(applicationEdges);
  const reachedNodes = new Map<string, GraphNode>([[root.id, root]]);
  const queue = [root.id];

  // Traverse only through edges that survive the active filters. Filtering
  // during traversal prevents hidden nodes from bridging otherwise pruned
  // branches.
  for (let index = 0; index < queue.length; index += 1) {
    const currentNodeId = queue[index];
    if (currentNodeId === undefined) {
      continue;
    }

    for (const edge of outgoingByNode.get(currentNodeId) ?? []) {
      if (!allowed(confidenceFilter, edge.confidence)) {
        continue;
      }

      const target = nodesById.get(edge.targetNodeId);
      if (
        target === undefined ||
        (target.id !== root.id && !nodeAllowed(nodeFilter, target))
      ) {
        continue;
      }

      if (reachedNodes.has(target.id)) {
        continue;
      }

      reachedNodes.set(target.id, target);
      queue.push(target.id);
    }
  }

  // Rebuild the edge set from reached nodes so cycle-closing and other
  // internal edges are retained even when their target was already visited.
  const reachedEdges = applicationEdges
    .filter(
      (edge) =>
        reachedNodes.has(edge.sourceNodeId) &&
        reachedNodes.has(edge.targetNodeId) &&
        allowed(confidenceFilter, edge.confidence),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  const graph: EndpointGraph = {
    applicationId: endpoint.applicationId,
    endpointId: endpoint.id,
    nodeFilters: request.index.nodeFilters,
    nodes: [...reachedNodes.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    edges: reachedEdges,
    diagnostics: request.index.diagnostics,
  };
  const validation = validateEndpointGraph(graph);
  if (!validation.valid) {
    throw new Error(
      "Endpoint graph validation failed for " + endpoint.id + ": " +
        validation.issues.map((issue) =>
          issue.code + " at " + issue.path +
          (issue.relatedIds.length === 0
            ? ""
            : " [" + issue.relatedIds.join(", ") + "]")
        ).join("; "),
    );
  }
  return graph;
}
