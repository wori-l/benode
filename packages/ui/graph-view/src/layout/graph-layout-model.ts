import type { ElkExtendedEdge, ElkNode } from "elkjs";

import type {
  GraphGroup,
  GroupedEndpointGraph,
} from "../graph/graph-grouping.js";
import {
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  METHOD_GAP,
  METHOD_NODE_HEIGHT,
  METHOD_NODE_WIDTH,
  sortedGroups,
} from "./graph-layout-types.js";

export interface ElkGraphModel {
  readonly graph: ElkNode;
  readonly groups: readonly GraphGroup[];
  readonly layoutNodeIdByGraphNodeId: ReadonlyMap<string, string>;
}

const ROOT_LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.mergeEdges": "false",
  "elk.layered.thoroughness": "3",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "24",
  "elk.spacing.edgeEdge": "16",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.spacing.edgeNode": "20",
  "elk.layered.spacing.nodeNodeBetweenLayers": "170",
  "elk.spacing.nodeNode": "80",
  "elk.padding": "[top=40,left=40,bottom=40,right=40]",
  "elk.randomSeed": "0",
} as const;

function groupLayoutNode(group: GraphGroup): ElkNode {
  return {
    id: group.id,
    layoutOptions: {
      "elk.padding": "[top=" + GROUP_HEADER_HEIGHT.toString() +
        ",left=" + GROUP_PADDING.toString() +
        ",bottom=" + GROUP_PADDING.toString() +
        ",right=" + GROUP_PADDING.toString() + "]",
      "elk.spacing.nodeNode": METHOD_GAP.toString(),
    },
    children: group.methods.map((method) => ({
      id: method.id,
      width: METHOD_NODE_WIDTH,
      height: METHOD_NODE_HEIGHT,
    })),
  };
}

function layoutNodeIds(
  groups: readonly GraphGroup[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const group of groups) {
    for (const method of group.methods) {
      result.set(method.id, method.id);
    }
    if (group.terminalNode !== undefined) {
      result.set(group.terminalNode.id, group.id);
    }
  }
  return result;
}

function layoutEdges(
  grouped: GroupedEndpointGraph,
  layoutNodeIdByGraphNodeId: ReadonlyMap<string, string>,
): ElkExtendedEdge[] {
  return [...grouped.graph.edges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((edge) => {
      const source = layoutNodeIdByGraphNodeId.get(edge.sourceNodeId);
      const target = layoutNodeIdByGraphNodeId.get(edge.targetNodeId);
      return source === undefined || target === undefined
        ? []
        : [{
            id: edge.id,
            sources: [source],
            targets: [target],
          }];
    });
}

export function createElkGraphModel(
  grouped: GroupedEndpointGraph,
  rootNodeId: string,
): ElkGraphModel {
  const groups = sortedGroups(grouped, rootNodeId);
  const layoutNodeIdByGraphNodeId = layoutNodeIds(groups);
  return {
    groups,
    layoutNodeIdByGraphNodeId,
    graph: {
      id: "root",
      layoutOptions: ROOT_LAYOUT_OPTIONS,
      children: [
        ...groups.map(groupLayoutNode),
      ],
      edges: layoutEdges(grouped, layoutNodeIdByGraphNodeId),
    },
  };
}
