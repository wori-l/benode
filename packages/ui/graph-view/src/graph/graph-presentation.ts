import type { Edge, Node } from "@vue-flow/core";

import type { GraphFocusProjection } from "./graph-focus.js";
import type {
  BenodeEdgeData,
  BenodeNodeData,
  LayoutResult,
} from "../layout/graph-layout-types.js";

function className(value: Node<BenodeNodeData>["class"]): string {
  return typeof value === "string" ? value : "";
}

export function decorateNodes(
  layout: LayoutResult | undefined,
  focus: GraphFocusProjection | undefined,
): Node<BenodeNodeData>[] {
  if (focus === undefined) {
    return layout?.nodes ?? [];
  }
  return (layout?.nodes ?? []).map((node) => {
    const active = node.data?.kind === "group"
      ? focus.activeGroupIds.has(node.id)
      : focus.activeNodeIds.has(node.id);
    return {
      ...node,
      class: className(node.class) + (active ? " focus-active" : " focus-dimmed"),
    };
  });
}

export function decorateEdges(
  layout: LayoutResult | undefined,
  focus: GraphFocusProjection | undefined,
): Edge<BenodeEdgeData>[] {
  if (focus === undefined) {
    return layout?.edges ?? [];
  }
  return (layout?.edges ?? []).map((edge) => ({
    ...edge,
    class: className(edge.class) +
      (edge.data !== undefined && focus.activeEdgeIds.has(edge.data.graphEdge.id)
        ? " focus-active"
        : " focus-dimmed"),
  }));
}
