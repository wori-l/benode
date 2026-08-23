import type { GraphEdge } from "@benode/core";
import { MarkerType, type Edge } from "@vue-flow/core";
import type { ElkExtendedEdge, ElkPoint } from "elkjs";

import type {
  BenodeEdgeData,
  RoutedEdgePoint,
} from "./graph-layout-types.js";

function samePoint(left: RoutedEdgePoint, right: RoutedEdgePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function routePoints(
  edge: ElkExtendedEdge,
  offset: RoutedEdgePoint,
): readonly RoutedEdgePoint[] {
  const section = edge.sections?.[0];
  if (section === undefined || (edge.sections?.length ?? 0) !== 1) {
    throw new Error("ELK returned an unsupported route for edge " + edge.id + ".");
  }
  const points: ElkPoint[] = [
    section.startPoint,
    ...section.bendPoints ?? [],
    section.endPoint,
  ];
  return points
    .filter((point, index) =>
      index === 0 || !samePoint(point, points[index - 1] ?? point))
    .map((point) => ({
      x: point.x + offset.x,
      y: point.y + offset.y,
    }));
}

export function routedFlowEdges(
  graphEdges: readonly GraphEdge[],
  elkEdges: readonly ElkExtendedEdge[],
  layoutNodeIdByGraphNodeId: ReadonlyMap<string, string>,
  nodeToGroupId: ReadonlyMap<string, string>,
  groupOffsetById: ReadonlyMap<string, RoutedEdgePoint>,
  groupColorIndexById: ReadonlyMap<string, number>,
): Edge<BenodeEdgeData>[] {
  const elkEdgeById = new Map(elkEdges.map((edge) => [edge.id, edge]));
  return [...graphEdges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((edge) => {
      const source = layoutNodeIdByGraphNodeId.get(edge.sourceNodeId);
      const target = layoutNodeIdByGraphNodeId.get(edge.targetNodeId);
      if (source === undefined || target === undefined) {
        return [];
      }
      const elkEdge = elkEdgeById.get(edge.id);
      if (elkEdge === undefined) {
        throw new Error("ELK did not return edge " + edge.id + ".");
      }
      const sourceGroupId = nodeToGroupId.get(edge.sourceNodeId);
      const targetGroupId = nodeToGroupId.get(edge.targetNodeId);
      const targetColorIndex = targetGroupId === undefined
        ? undefined
        : groupColorIndexById.get(targetGroupId);
      const targetColorClass = targetColorIndex === undefined
        ? ""
        : " filter-color-" + targetColorIndex.toString();
      const internalGroupId = sourceGroupId !== undefined &&
        sourceGroupId === targetGroupId
        ? sourceGroupId
        : undefined;
      const routeOffset = internalGroupId === undefined
        ? { x: 0, y: 0 }
        : groupOffsetById.get(internalGroupId);
      if (routeOffset === undefined) {
        throw new Error("Missing ELK offset for group " + internalGroupId + ".");
      }
      return [{
        id: edge.id,
        source,
        target,
        type: "benode-routed",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: targetColorIndex === undefined
            ? "#8493a5"
            : "var(--filter-color-" + targetColorIndex.toString() + ")",
        },
        zIndex: internalGroupId === undefined ? 0 : 1,
        selectable: true,
        focusable: true,
        label: edge.occurrenceCount > 1
          ? "×" + edge.occurrenceCount.toString()
          : undefined,
        class: "edge-method" + targetColorClass +
          " confidence-" + edge.confidence,
        ariaLabel: (edge.occurrenceCount > 1
          ? edge.occurrenceCount.toString() + " calls, "
          : "") + "confidence " + edge.confidence,
        data: {
          kind: "method" as const,
          graphEdge: edge,
          route: routePoints(elkEdge, routeOffset),
        },
      }];
    });
}
