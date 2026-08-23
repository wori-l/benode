import type {
  EndpointGraph,
  GraphNodeFilter,
  GraphNodeFilterTarget,
} from "@benode/core";

import { groupEndpointGraph } from "./graph-grouping.js";

export interface GraphProjection {
  readonly graph: EndpointGraph;
  readonly filterCounts: ReadonlyMap<string, number>;
}

function matchingFilterIds(
  filterIds: readonly string[],
  target: GraphNodeFilterTarget,
  filtersById: ReadonlyMap<string, GraphNodeFilter>,
): readonly string[] {
  return filterIds.filter(
    (filterId) => filtersById.get(filterId)?.target === target,
  );
}

function allSelected(
  filterIds: readonly string[],
  selectedFilterIds: ReadonlySet<string>,
): boolean {
  return filterIds.every((filterId) => selectedFilterIds.has(filterId));
}

export function projectEndpointGraph(
  graph: EndpointGraph,
  rootNodeId: string,
  selectedFilterIds: ReadonlySet<string>,
): GraphProjection {
  const grouped = groupEndpointGraph(graph, rootNodeId);
  const filtersById = new Map(
    graph.nodeFilters.map((filter) => [filter.id, filter]),
  );
  const filterCounts = new Map<string, number>();
  const visibleNodeIds = new Set<string>();

  for (const group of grouped.groups) {
    const groupFilterIds = matchingFilterIds(group.filterIds, "group", filtersById);
    for (const filterId of groupFilterIds) {
      filterCounts.set(filterId, (filterCounts.get(filterId) ?? 0) + 1);
    }
    for (const method of group.methods) {
      for (const filterId of matchingFilterIds(method.filterIds, "node", filtersById)) {
        filterCounts.set(filterId, (filterCounts.get(filterId) ?? 0) + 1);
      }
    }

    if (!allSelected([...groupFilterIds], selectedFilterIds)) {
      continue;
    }
    const visibleMethods = group.methods.filter((method) =>
      allSelected(
        matchingFilterIds(method.filterIds, "node", filtersById),
        selectedFilterIds,
      ));
    if (visibleMethods.length === 0) {
      continue;
    }
    if (group.terminalNode !== undefined) {
      visibleNodeIds.add(group.terminalNode.id);
    }
    for (const method of visibleMethods) {
      visibleNodeIds.add(method.id);
    }
  }

  if (visibleNodeIds.size === graph.nodes.length) {
    return { graph, filterCounts };
  }

  return {
    graph: {
      ...graph,
      nodes: graph.nodes.filter((node) => visibleNodeIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) =>
          visibleNodeIds.has(edge.sourceNodeId) &&
          visibleNodeIds.has(edge.targetNodeId),
      ),
    },
    filterCounts,
  };
}
