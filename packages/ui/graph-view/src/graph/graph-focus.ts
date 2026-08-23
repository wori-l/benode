import type { GraphEdge } from "@benode/core";

import type { GroupedEndpointGraph } from "./graph-grouping.js";

export type GraphFocusTarget =
  | { readonly kind: "group"; readonly id: string }
  | { readonly kind: "node"; readonly id: string };

export interface GraphFocusProjection {
  readonly target: GraphFocusTarget;
  readonly activeNodeIds: ReadonlySet<string>;
  readonly activeGroupIds: ReadonlySet<string>;
  readonly activeEdgeIds: ReadonlySet<string>;
}

interface AdjacentEdge {
  readonly nodeId: string;
  readonly edgeId: string;
}

function adjacency(
  edges: readonly GraphEdge[],
  direction: "incoming" | "outgoing",
): ReadonlyMap<string, readonly AdjacentEdge[]> {
  const result = new Map<string, AdjacentEdge[]>();
  for (const edge of edges) {
    const from = direction === "outgoing"
      ? edge.sourceNodeId
      : edge.targetNodeId;
    const to = direction === "outgoing"
      ? edge.targetNodeId
      : edge.sourceNodeId;
    const adjacent = result.get(from) ?? [];
    adjacent.push({ nodeId: to, edgeId: edge.id });
    result.set(from, adjacent);
  }
  return result;
}

function traverse(
  seeds: readonly string[],
  adjacentByNode: ReadonlyMap<string, readonly AdjacentEdge[]>,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
): void {
  const reached = new Set(seeds);
  const queue = [...seeds];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === undefined) {
      continue;
    }
    nodeIds.add(current);
    for (const adjacent of adjacentByNode.get(current) ?? []) {
      edgeIds.add(adjacent.edgeId);
      nodeIds.add(adjacent.nodeId);
      if (!reached.has(adjacent.nodeId)) {
        reached.add(adjacent.nodeId);
        queue.push(adjacent.nodeId);
      }
    }
  }
}

function focusSeeds(
  grouped: GroupedEndpointGraph,
  target: GraphFocusTarget,
): readonly string[] {
  if (target.kind === "node") {
    return grouped.graph.nodes.some((node) => node.id === target.id)
      ? [target.id]
      : [];
  }
  const group = grouped.groups.find((candidate) => candidate.id === target.id);
  if (group === undefined) {
    return [];
  }
  return [
    ...group.methods.map((method) => method.id),
    ...(group.terminalNode === undefined ? [] : [group.terminalNode.id]),
  ];
}

export function projectGraphFocus(
  grouped: GroupedEndpointGraph,
  target: GraphFocusTarget | undefined,
): GraphFocusProjection | undefined {
  if (target === undefined) {
    return undefined;
  }
  const seeds = focusSeeds(grouped, target);
  if (seeds.length === 0) {
    return undefined;
  }

  const activeNodeIds = new Set<string>();
  const activeEdgeIds = new Set<string>();
  // Upstream and downstream traversals share their result sets. This produces
  // the complete causal path while both traversals still terminate on cycles.
  traverse(
    seeds,
    adjacency(grouped.graph.edges, "incoming"),
    activeNodeIds,
    activeEdgeIds,
  );
  traverse(
    seeds,
    adjacency(grouped.graph.edges, "outgoing"),
    activeNodeIds,
    activeEdgeIds,
  );

  const activeGroupIds = new Set<string>();
  for (const nodeId of activeNodeIds) {
    const groupId = grouped.nodeToGroupId.get(nodeId);
    if (groupId !== undefined) {
      activeGroupIds.add(groupId);
    }
  }

  return {
    target,
    activeNodeIds,
    activeGroupIds,
    activeEdgeIds,
  };
}
