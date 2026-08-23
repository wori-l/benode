import type { GraphEdge, GraphNode } from "@benode/core";
import type { Edge, Node } from "@vue-flow/core";

import type {
  GraphGroup,
  GroupedEndpointGraph,
} from "../graph/graph-grouping.js";

export const GROUP_SUMMARY_WIDTH = 300;
export const GROUP_SUMMARY_HEIGHT = 138;
export const METHOD_NODE_WIDTH = 340;
export const METHOD_NODE_HEIGHT = 168;
export const GROUP_HEADER_HEIGHT = 126;
export const GROUP_PADDING = 20;
export const METHOD_GAP = 24;

export interface GroupNodeData extends Record<string, unknown> {
  readonly kind: "group";
  readonly group: GraphGroup;
}

export interface GraphNodeData extends Record<string, unknown> {
  readonly kind: "method";
  readonly graphNode: GraphNode;
  readonly isRoot: boolean;
}

export interface RoutedEdgePoint {
  readonly x: number;
  readonly y: number;
}

export interface BenodeEdgeData extends Record<string, unknown> {
  readonly kind: "method";
  readonly graphEdge: GraphEdge;
  readonly route: readonly RoutedEdgePoint[];
}

export type BenodeNodeData = GroupNodeData | GraphNodeData;

export interface LayoutResult {
  readonly nodes: Node<BenodeNodeData>[];
  readonly edges: Edge<BenodeEdgeData>[];
}

function graphDepths(
  grouped: GroupedEndpointGraph,
  rootNodeId: string,
): ReadonlyMap<string, number> {
  const outgoing = new Map<string, string[]>();
  for (const edge of grouped.graph.edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }
  const depths = new Map([[rootNodeId, 0]]);
  const queue = [rootNodeId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === undefined) {
      continue;
    }
    const nextDepth = (depths.get(current) ?? 0) + 1;
    for (const target of outgoing.get(current) ?? []) {
      if (!depths.has(target)) {
        depths.set(target, nextDepth);
        queue.push(target);
      }
    }
  }
  return depths;
}

function compareMethods(
  depths: ReadonlyMap<string, number>,
  left: GraphNode,
  right: GraphNode,
): number {
  const depth = (depths.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
    (depths.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  if (depth !== 0) {
    return depth;
  }
  const leftLocation = left.sourceLocation;
  const rightLocation = right.sourceLocation;
  const location = (leftLocation?.uri ?? "").localeCompare(rightLocation?.uri ?? "") ||
    (leftLocation?.start.line ?? Number.MAX_SAFE_INTEGER) -
      (rightLocation?.start.line ?? Number.MAX_SAFE_INTEGER) ||
    (leftLocation?.start.column ?? Number.MAX_SAFE_INTEGER) -
      (rightLocation?.start.column ?? Number.MAX_SAFE_INTEGER);
  return location || left.symbol.signature.localeCompare(right.symbol.signature) ||
    left.id.localeCompare(right.id);
}

export function sortedGroups(
  grouped: GroupedEndpointGraph,
  rootNodeId: string,
): readonly GraphGroup[] {
  const depths = graphDepths(grouped, rootNodeId);
  return grouped.groups.map((group) => ({
    ...group,
    methods: [...group.methods].sort((left, right) =>
      compareMethods(depths, left, right)),
  }));
}
