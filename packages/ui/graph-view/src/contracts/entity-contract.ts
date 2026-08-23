import type { GraphNode } from "@benode/core";

import type { GraphGroup } from "../graph/graph-grouping.js";

function nodeTables(node: GraphNode | undefined): readonly string[] {
  const value = node?.metadata["entityTables"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function entityTables(group: GraphGroup): readonly string[] {
  const nodes = [group.terminalNode, ...group.methods];
  return [...new Set(nodes.flatMap(nodeTables))]
    .sort((left, right) => left.localeCompare(right));
}
