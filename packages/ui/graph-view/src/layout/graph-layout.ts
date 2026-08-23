import type { Node, XYPosition } from "@vue-flow/core";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs";

import type {
  GraphGroup,
  GroupedEndpointGraph,
} from "../graph/graph-grouping.js";
import { routedFlowEdges } from "./graph-layout-edges.js";
import { createElkGraphModel } from "./graph-layout-model.js";
import {
  GROUP_SUMMARY_HEIGHT,
  GROUP_SUMMARY_WIDTH,
  METHOD_NODE_HEIGHT,
  METHOD_NODE_WIDTH,
  type BenodeNodeData,
  type LayoutResult,
} from "./graph-layout-types.js";

const elk = new ELK();
const GROUP_COLOR_COUNT = 10;

function position(node: ElkNode): XYPosition {
  return { x: node.x ?? 0, y: node.y ?? 0 };
}

function childById(parent: ElkNode, id: string): ElkNode {
  const child = parent.children?.find((candidate) => candidate.id === id);
  if (child === undefined) {
    throw new Error("ELK did not return node " + id + ".");
  }
  return child;
}

function groupFlowNode(
  group: GraphGroup,
  layoutNode: ElkNode,
  colorClass: string,
): Node<BenodeNodeData> {
  return {
    id: group.id,
    type: "benode-group",
    position: position(layoutNode),
    width: layoutNode.width ?? GROUP_SUMMARY_WIDTH,
    height: layoutNode.height ?? GROUP_SUMMARY_HEIGHT,
    draggable: false,
    selectable: true,
    connectable: false,
    class: colorClass,
    ariaLabel: group.role + " class " + group.qualifiedName,
    data: { kind: "group", group },
  };
}

function methodFlowNode(
  groupId: string,
  layoutNode: ElkNode,
  graphNode: GraphGroup["methods"][number],
  rootNodeId: string,
): Node<BenodeNodeData> {
  return {
    id: graphNode.id,
    type: "benode-method",
    parentNode: groupId,
    extent: "parent",
    position: position(layoutNode),
    width: layoutNode.width ?? METHOD_NODE_WIDTH,
    height: layoutNode.height ?? METHOD_NODE_HEIGHT,
    draggable: false,
    selectable: true,
    connectable: false,
    class: "method-node",
    ariaLabel: graphNode.symbol.signature,
    data: {
      kind: "method",
      graphNode,
      isRoot: graphNode.id === rootNodeId,
    },
  };
}

function groupColorIndex(
  group: GraphGroup,
  grouped: GroupedEndpointGraph,
): number | undefined {
  const groupFilters = grouped.graph.nodeFilters.filter(
    (filter) => filter.target === "group",
  );
  const index = groupFilters.findIndex(
    (filter) => group.filterIds.includes(filter.id),
  );
  return index < 0 ? undefined : index % GROUP_COLOR_COUNT;
}

export async function layoutEndpointGraph(
  grouped: GroupedEndpointGraph,
  rootNodeId: string,
): Promise<LayoutResult> {
  const model = createElkGraphModel(grouped, rootNodeId);
  if ((model.graph.children?.length ?? 0) === 0) {
    return { nodes: [], edges: [] };
  }

  const layout = await elk.layout(model.graph);
  const nodes: Node<BenodeNodeData>[] = [];
  const groupOffsetById = new Map<string, XYPosition>();
  const groupColorIndexById = new Map(
    model.groups.flatMap((group) => {
      const colorIndex = groupColorIndex(group, grouped);
      return colorIndex === undefined ? [] : [[group.id, colorIndex] as const];
    }),
  );

  for (const group of model.groups) {
    const layoutGroup = childById(layout, group.id);
    const colorIndex = groupColorIndexById.get(group.id);
    groupOffsetById.set(group.id, position(layoutGroup));
    nodes.push(groupFlowNode(
      group,
      layoutGroup,
      colorIndex === undefined ? "" : "filter-color-" + colorIndex.toString(),
    ));
    for (const method of group.methods) {
      nodes.push(methodFlowNode(
        group.id,
        childById(layoutGroup, method.id),
        method,
        rootNodeId,
      ));
    }
  }

  return {
    nodes,
    edges: routedFlowEdges(
      grouped.graph.edges,
      layout.edges ?? [],
      model.layoutNodeIdByGraphNodeId,
      grouped.nodeToGroupId,
      groupOffsetById,
      groupColorIndexById,
    ),
  };
}
