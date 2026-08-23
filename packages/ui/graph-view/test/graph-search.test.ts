import type { GraphNode } from "@benode/core";
import type { Node } from "@vue-flow/core";
import { describe, expect, it } from "vitest";

import type { GraphGroup } from "../src/graph/graph-grouping.js";
import type { BenodeNodeData } from "../src/layout/graph-layout-types.js";
import { graphSearchMatches } from "../src/graph/graph-search.js";

function classNode(id: string, name: string): Node<BenodeNodeData> {
  const group: GraphGroup = {
    id,
    ownerSymbolId: id,
    name,
    qualifiedName: "example." + name,
    namespaceName: "example",
    role: "service",
    filterIds: [],
    methods: [],
    isRoot: false,
  };
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind: "group", group },
  };
}

function methodNode(id: string, name: string): Node<BenodeNodeData> {
  const graphNode: GraphNode = {
    id,
    role: "service",
    filterIds: [],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    symbol: {
      name,
      qualifiedName: "example.InventoryService#" + name,
      signature: "example.InventoryService#" + name + "()",
    },
    metadata: {},
  };
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind: "method", graphNode, isRoot: false },
  };
}

const NODES = [
  classNode("inventory-class", "InventoryService"),
  methodNode("find-method", "findInventory"),
  methodNode("refresh-method", "refresh"),
  classNode("audit-class", "AuditService"),
];

describe("graphSearchMatches", () => {
  it("matches class names case-insensitively in graph order", () => {
    expect(graphSearchMatches(NODES, "SERVICE")).toEqual([
      {
        nodeId: "inventory-class",
        label: "InventoryService",
        kind: "class",
      },
      {
        nodeId: "audit-class",
        label: "AuditService",
        kind: "class",
      },
    ]);
  });

  it("matches method and class names with the same substring", () => {
    expect(graphSearchMatches(NODES, "invent").map((match) => match.nodeId))
      .toEqual(["inventory-class", "find-method"]);
  });

  it("orders child matches by their absolute visual position", () => {
    const parent = {
      ...classNode("parent", "Container"),
      position: { x: 400, y: 20 },
    };
    const nested = {
      ...methodNode("nested", "matchNested"),
      parentNode: parent.id,
      position: { x: 20, y: 100 },
    };
    const left = {
      ...methodNode("left", "matchLeft"),
      position: { x: 100, y: 100 },
    };

    expect(graphSearchMatches([parent, nested, left], "match")
      .map((match) => match.nodeId)).toEqual(["left", "nested"]);
  });

  it("does not search for an empty or whitespace-only value", () => {
    expect(graphSearchMatches(NODES, "   ")).toEqual([]);
  });
});
