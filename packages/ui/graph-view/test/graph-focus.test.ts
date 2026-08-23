import {
  type EndpointGraph,
  type GraphEdge,
  type GraphNode,
} from "@benode/core";
import { describe, expect, it } from "vitest";

import { projectGraphFocus } from "../src/graph/graph-focus.js";
import { groupEndpointGraph } from "../src/graph/graph-grouping.js";

function node(id: string, owner: string): GraphNode {
  return {
    id,
    role: id === "root" ? "controller" : "service",
    filterIds: [],
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

function edge(id: string, sourceNodeId: string, targetNodeId: string): GraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    confidence: "exact",
    occurrenceCount: 1,
    evidence: [],
  };
}

function fixture(): EndpointGraph {
  return {
    applicationId: "application",
    endpointId: "endpoint",
    nodeFilters: [],
    nodes: [
      node("root", "Controller"),
      node("selected", "Selected"),
      node("downstream", "Downstream"),
      node("upstream", "Upstream"),
      node("sibling", "Sibling"),
    ],
    edges: [
      edge("root-selected", "root", "selected"),
      edge("root-sibling", "root", "sibling"),
      edge("selected-downstream", "selected", "downstream"),
      edge("downstream-selected", "downstream", "selected"),
      edge("upstream-selected", "upstream", "selected"),
    ],
    diagnostics: [],
  };
}

describe("projectGraphFocus", () => {
  it("keeps all directed ancestors and descendants without sibling branches", () => {
    const grouped = groupEndpointGraph(fixture(), "root");
    const focus = projectGraphFocus(grouped, { kind: "node", id: "selected" });

    expect([...focus?.activeNodeIds ?? []].sort()).toEqual([
      "downstream",
      "root",
      "selected",
      "upstream",
    ]);
    expect([...focus?.activeEdgeIds ?? []].sort()).toEqual([
      "downstream-selected",
      "root-selected",
      "selected-downstream",
      "upstream-selected",
    ]);
    expect(focus?.activeNodeIds.has("sibling")).toBe(false);
  });

  it("focuses a class from all of its member methods", () => {
    const graph = fixture();
    const selected = graph.nodes.find((item) => item.id === "selected");
    const sibling = graph.nodes.find((item) => item.id === "sibling");
    if (selected === undefined || sibling === undefined) {
      throw new Error("Incomplete fixture.");
    }
    const grouped = groupEndpointGraph({
      ...graph,
      nodes: graph.nodes.map((item) => item.id === sibling.id
        ? { ...item, metadata: selected.metadata, symbol: {
            ...item.symbol,
            qualifiedName: "example.Selected#sibling",
          } }
        : item),
    }, "root");
    const groupId = grouped.nodeToGroupId.get("selected");
    const focus = groupId === undefined
      ? undefined
      : projectGraphFocus(grouped, { kind: "group", id: groupId });

    expect(focus?.activeNodeIds.has("selected")).toBe(true);
    expect(focus?.activeNodeIds.has("sibling")).toBe(true);
  });

  it("returns no focus for filtered-out targets", () => {
    const grouped = groupEndpointGraph(fixture(), "root");
    expect(projectGraphFocus(grouped, { kind: "node", id: "missing" }))
      .toBeUndefined();
  });
});
