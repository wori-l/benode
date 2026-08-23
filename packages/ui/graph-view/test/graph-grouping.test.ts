import {
  type EndpointGraph,
  type GraphNode,
} from "@benode/core";
import { describe, expect, it } from "vitest";

import { groupEndpointGraph } from "../src/graph/graph-grouping.js";

function node(
  id: string,
  qualifiedName: string,
  role: GraphNode["role"],
  ownerSymbolId?: string,
): GraphNode {
  return {
    id,
    role,
    filterIds: [],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    symbol: { name: id, qualifiedName, signature: qualifiedName + "()" },
    metadata: ownerSymbolId === undefined ? {} : { ownerSymbolId },
  };
}

function graph(nodes: readonly GraphNode[]): EndpointGraph {
  return {
    applicationId: "application",
    endpointId: "endpoint",
    nodeFilters: [],
    nodes,
    edges: [],
    diagnostics: [],
  };
}

describe("groupEndpointGraph", () => {
  it("groups methods by owner symbol and derives the class label", () => {
    const complete = graph([
      node("root", "example.DemoController#root", "controller", "controller-id"),
      node("other", "example.DemoController#other", "controller", "controller-id"),
    ]);

    const grouped = groupEndpointGraph(complete, "root");

    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]).toMatchObject({
      name: "DemoController",
      qualifiedName: "example.DemoController",
      namespaceName: "example",
      role: "controller",
      isRoot: true,
    });
    expect(grouped.groups[0]?.methods.map((method) => method.id)).toEqual([
      "root",
      "other",
    ]);
  });

  it("uses the qualified owner as deterministic fallback", () => {
    const grouped = groupEndpointGraph(graph([
      node("one", "example.Fallback#one", "helper"),
      node("two", "example.Fallback#two", "helper"),
    ]), "missing");

    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]?.id).toContain(encodeURIComponent("example.Fallback"));
  });

  it("puts unresolved methods inside a class group", () => {
    const unresolved = {
      ...node("unknown", "unknown", "unresolved"),
    };
    const grouped = groupEndpointGraph(graph([unresolved]), "missing");

    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]?.namespaceName).toBe("unknown");
    expect(grouped.groups[0]?.methods.map((item) => item.id)).toEqual([
      "unknown",
    ]);
    expect(grouped.nodeToGroupId.get("unknown")).toBe(grouped.groups[0]?.id);
  });

  it("omits a class that has no methods", () => {
    const type = {
      ...node("empty-type", "example.Empty", "entity"),
      groupNode: true,
      metadata: { symbolKind: "type" },
    };

    const grouped = groupEndpointGraph(graph([type]), "missing");

    expect(grouped.groups).toEqual([]);
    expect(grouped.graph.nodes).toEqual([]);
    expect(grouped.nodeToGroupId.size).toBe(0);
  });

  it("keeps a type node as the terminal representation of its class", () => {
    const terminal = {
      ...node("entity-owner", "example.Entity#Entity", "entity"),
      groupNode: true,
      metadata: { symbolKind: "type" },
    };
    const method = node(
      "read",
      "example.Entity#read",
      "entity",
      "entity-owner",
    );
    const legacyEntityMethod = {
      ...node(
        "write",
        "example.Entity#write",
        "entity",
        "entity-owner",
      ),
      metadata: {
        ownerSymbolId: "entity-owner",
        symbolKind: "method",
      },
    };

    const grouped = groupEndpointGraph(
      graph([terminal, method, legacyEntityMethod]),
      "missing",
    );

    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]?.terminalNode?.id).toBe("entity-owner");
    expect(grouped.groups[0]?.methods.map((item) => item.id)).toEqual([
      "read",
      "write",
    ]);
    expect(grouped.nodeToGroupId.get("entity-owner"))
      .toBe(grouped.nodeToGroupId.get("read"));
  });

  it("keeps an inner class in a separate group with the real namespace", () => {
    const outer = {
      ...node(
        "outer-call",
        "example.ParentService#call",
        "service",
        "outer-type",
      ),
      metadata: {
        ownerSymbolId: "outer-type",
        namespaceName: "example",
        symbolKind: "method",
      },
    };
    const inner = {
      ...node(
        "inner-fetch",
        "example.ParentService.InnerClient#fetch",
        "httpClient",
        "inner-type",
      ),
      metadata: {
        ownerSymbolId: "inner-type",
        namespaceName: "example",
        symbolKind: "method",
      },
    };

    const grouped = groupEndpointGraph(graph([outer, inner]), "missing");

    expect(grouped.groups).toHaveLength(2);
    expect(grouped.groups.map((group) => ({
      name: group.name,
      namespaceName: group.namespaceName,
      methods: group.methods.map((method) => method.id),
    }))).toEqual([
      {
        name: "ParentService",
        namespaceName: "example",
        methods: ["outer-call"],
      },
      {
        name: "InnerClient",
        namespaceName: "example",
        methods: ["inner-fetch"],
      },
    ]);
    expect(grouped.nodeToGroupId.get("outer-call"))
      .not.toBe(grouped.nodeToGroupId.get("inner-fetch"));
  });
});
