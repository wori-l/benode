import {
  type EndpointGraph,
  type GraphNode,
  type GraphNodeFilter,
} from "@benode/core";
import { describe, expect, it } from "vitest";

import { projectEndpointGraph } from "../src/graph/graph-visibility.js";

const FILTERS: readonly GraphNodeFilter[] = [
  { id: "controller", label: "Controller", section: "Types", target: "group", defaultSelected: true },
  { id: "service", label: "Service", section: "Types", target: "group", defaultSelected: true },
  { id: "helper", label: "Helper", section: "Types", target: "group", defaultSelected: false },
  { id: "external", label: "External", section: "Types", target: "group", defaultSelected: false },
  { id: "trivial", label: "Low signal", section: "Methods", target: "node", defaultSelected: false },
];

function node(
  id: string,
  owner: string,
  role: string,
  extraFilterIds: readonly string[] = [],
): GraphNode {
  return {
    id,
    role,
    filterIds: [role, ...extraFilterIds],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    symbol: {
      name: id,
      qualifiedName: "example." + owner + "#" + id,
      signature: "example." + owner + "#" + id + "()",
    },
    metadata: { ownerSymbolId: owner },
  };
}

function graph(): EndpointGraph {
  return {
    applicationId: "application",
    endpointId: "endpoint",
    nodeFilters: FILTERS,
    nodes: [
      node("root", "Controller", "controller"),
      node("load", "Service", "service"),
      node("property", "Service", "service", ["trivial"]),
      node("other", "OtherService", "service", ["trivial"]),
      node("helper", "Helper", "helper"),
    ],
    edges: [
      {
        id: "root-load",
        sourceNodeId: "root",
        targetNodeId: "load",
        confidence: "exact",
        occurrenceCount: 1,
        evidence: [],
      },
      {
        id: "load-property",
        sourceNodeId: "load",
        targetNodeId: "property",
        confidence: "exact",
        occurrenceCount: 1,
        evidence: [],
      },
    ],
    diagnostics: [],
  };
}

function project(selected: readonly string[], source = graph()) {
  return projectEndpointGraph(source, "root", new Set(selected));
}

describe("projectEndpointGraph", () => {
  it("filters groups and nodes independently from opaque memberships", () => {
    const projection = project(["controller", "service"]);

    expect(projection.graph.nodes.map((item) => item.id)).toEqual([
      "root",
      "load",
    ]);
    expect(projection.graph.edges.map((edge) => edge.id)).toEqual([
      "root-load",
    ]);
    expect(Object.fromEntries(projection.filterCounts)).toEqual({
      controller: 1,
      service: 2,
      trivial: 2,
      helper: 1,
    });
  });

  it("never shows opted-in nodes from an unselected group", () => {
    expect(project(["controller", "trivial"]).graph.nodes.map(
      (item) => item.id,
    )).toEqual(["root"]);
  });

  it("includes opted-in nodes only inside selected groups", () => {
    expect(project(["controller", "service", "trivial"]).graph.nodes.map(
      (item) => item.id,
    )).toEqual(["root", "load", "property", "other"]);
  });

  it("omits a group when all of its nodes are hidden", () => {
    const source = graph();
    const type = {
      ...node("OtherService", "OtherService", "service"),
      groupNode: true,
      symbol: {
        name: "OtherService",
        qualifiedName: "example.OtherService",
        signature: "example.OtherService",
      },
      metadata: { symbolKind: "type" },
    };
    const projection = project(
      ["controller", "service"],
      { ...source, nodes: [...source.nodes, type] },
    );

    expect(projection.graph.nodes.map((item) => item.id)).not.toContain(
      "OtherService",
    );
    expect(projection.graph.nodes.map((item) => item.id)).not.toContain(
      "other",
    );
  });
});
