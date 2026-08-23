import type { Node } from "@vue-flow/core";
import { computed, ref, watch, type ComputedRef } from "vue";

import type { BenodeNodeData } from "../layout/graph-layout-types.js";

export interface GraphSearchMatch {
  readonly nodeId: string;
  readonly label: string;
  readonly kind: "class" | "method";
}

function searchMatch(
  node: Node<BenodeNodeData>,
): GraphSearchMatch | undefined {
  const data = node.data;
  if (data === undefined) {
    return undefined;
  }
  return data.kind === "group"
    ? {
        nodeId: node.id,
        label: data.group.name,
        kind: "class",
      }
    : {
        nodeId: node.id,
        label: data.graphNode.symbol.name,
        kind: "method",
      };
}

function absolutePosition(
  node: Node<BenodeNodeData>,
  nodeById: ReadonlyMap<string, Node<BenodeNodeData>>,
): { readonly x: number; readonly y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentNode;
  const visited = new Set<string>();
  while (parentId !== undefined && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeById.get(parentId);
    if (parent === undefined) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentNode;
  }
  return { x, y };
}

export function graphSearchMatches(
  nodes: readonly Node<BenodeNodeData>[],
  query: string,
): readonly GraphSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return nodes.flatMap((node, order) => {
    const match = searchMatch(node);
    if (
      match === undefined ||
      !match.label.toLowerCase().includes(normalizedQuery)
    ) {
      return [];
    }
    return [{ match, position: absolutePosition(node, nodeById), order }];
  }).sort((left, right) =>
    left.position.x - right.position.x ||
    left.position.y - right.position.y ||
    left.order - right.order)
    .map((item) => item.match);
}

export interface GraphSearchOptions {
  readonly nodes: ComputedRef<readonly Node<BenodeNodeData>[]>;
  readonly centerNode: (nodeId: string) => void;
}

export function useGraphSearch(options: GraphSearchOptions) {
  const searchQuery = ref("");
  const activeSearchIndex = ref(-1);
  const searchMatches = computed(() =>
    graphSearchMatches(options.nodes.value, searchQuery.value));
  const activeSearchMatch = computed(() =>
    searchMatches.value[activeSearchIndex.value]);
  const searchPosition = computed(() => searchMatches.value.length === 0
    ? "0 / 0"
    : (activeSearchIndex.value + 1).toString() +
      " / " + searchMatches.value.length.toString());

  function centerActiveMatch(): void {
    const match = activeSearchMatch.value;
    if (match !== undefined) {
      options.centerNode(match.nodeId);
    }
  }

  function moveSearch(direction: 1 | -1): void {
    const count = searchMatches.value.length;
    if (count === 0) {
      activeSearchIndex.value = -1;
      return;
    }
    const current = activeSearchIndex.value;
    activeSearchIndex.value = current < 0
      ? direction > 0 ? 0 : count - 1
      : (current + direction + count) % count;
    centerActiveMatch();
  }

  function clearSearch(): void {
    searchQuery.value = "";
    activeSearchIndex.value = -1;
  }

  watch(searchMatches, (matches) => {
    activeSearchIndex.value = matches.length === 0 ? -1 : 0;
    centerActiveMatch();
  });

  return {
    clearSearch,
    moveSearch,
    searchMatches,
    searchPosition,
    searchQuery,
  };
}
