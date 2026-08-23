import {
  type EndpointGraph,
  type GraphEdge,
  type GraphNode,
} from "@benode/core";
import { describe, expect, it } from "vitest";

import { groupEndpointGraph } from "../src/graph/graph-grouping.js";
import { layoutEndpointGraph } from "../src/layout/graph-layout.js";
import type { RoutedEdgePoint } from "../src/layout/graph-layout-types.js";
import { sampleGraphMessage } from "../src/debug/sample-graph.js";

function node(id: string, owner: string, role: GraphNode["role"]): GraphNode {
  return {
    id,
    role,
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

function graph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): EndpointGraph {
  return {
    applicationId: "application",
    endpointId: "endpoint",
    nodeFilters: [],
    nodes,
    edges,
    diagnostics: [],
  };
}

function verticalSegmentXs(route: readonly RoutedEdgePoint[]): number[] {
  const result: number[] = [];
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.x === current.x &&
      previous.y !== current.y
    ) {
      result.push(current.x);
    }
  }
  return result;
}

describe("layoutEndpointGraph", () => {
  it("lays out groups, their children and every edge in one ELK graph", async () => {
    const rootId = sampleGraphMessage.endpoint.handlerSymbolId;
    const grouped = groupEndpointGraph(sampleGraphMessage.graph, rootId);
    const result = await layoutEndpointGraph(grouped, rootId);

    expect(result.nodes).toHaveLength(12);
    expect(result.edges).toHaveLength(5);
    expect(result.nodes.every((node) => node.draggable === false)).toBe(true);
    const groups = result.nodes.filter((node) => node.data?.kind === "group");
    const methods = result.nodes.filter((node) => node.data?.kind === "method");
    expect(methods.every((method) =>
      groups.some((group) => group.id === method.parentNode))).toBe(true);
    expect(groups.every((group) =>
      methods.some((method) => method.parentNode === group.id))).toBe(true);
    expect(result.edges.every((item) =>
      item.type === "benode-routed" &&
      (item.data?.route.length ?? 0) >= 2)).toBe(true);

    const controllerGroupId = grouped.nodeToGroupId.get(rootId);
    const root = result.nodes.find((item) => item.id === rootId);
    const serviceGroupId = grouped.nodeToGroupId.get("sample:loadData");
    const controllerGroup = result.nodes.find(
      (item) => item.id === controllerGroupId,
    );
    const serviceGroup = result.nodes.find(
      (item) => item.id === serviceGroupId,
    );

    expect(root?.parentNode).toBe(controllerGroupId);
    expect(root?.data?.kind).toBe("method");
    expect(controllerGroup?.data?.kind).toBe("group");
    expect(controllerGroup?.position.x)
      .toBeLessThan(serviceGroup?.position.x ?? 0);

    expect(result.edges.find(
      (item) => item.id === "sample:service-repository",
    )?.label).toBe("×2");

    expect(result.edges.find((item) => item.id === "sample:service-entity"))
      .toMatchObject({
        source: "sample:loadData",
        target: "sample:entity",
        class: expect.stringContaining("filter-color-6"),
        markerEnd: {
          type: "arrowclosed",
          color: "var(--filter-color-6)",
        },
      });
  });

  it("lets ELK place and route methods inside the same group", async () => {
    const nodes = [
      node("root", "Controller", "controller"),
      node("local", "Controller", "controller"),
      node("target", "Service", "service"),
    ];
    const grouped = groupEndpointGraph(graph(nodes, [
      edge("internal", "root", "local"),
      edge("boundary", "local", "target"),
    ]), "root");
    const result = await layoutEndpointGraph(grouped, "root");
    const root = result.nodes.find((item) => item.id === "root");
    const local = result.nodes.find((item) => item.id === "local");

    expect(root?.parentNode).toBe(local?.parentNode);
    expect(root?.position).not.toEqual(local?.position);
    expect(result.edges.find((item) => item.id === "internal")?.data?.route.length)
      .toBeGreaterThanOrEqual(2);
  });

  it("routes same-class and external calls separately to a shared method", async () => {
    const nodes = [
      node("root", "Controller", "controller"),
      node("methodA", "RoutingService", "service"),
      node("methodB", "RoutingService", "service"),
      node("methodC", "RoutingCaller", "service"),
    ];
    const grouped = groupEndpointGraph(graph(nodes, [
      edge("root-to-a", "root", "methodA"),
      edge("root-to-c", "root", "methodC"),
      edge("a-to-b", "methodA", "methodB"),
      edge("c-to-b", "methodC", "methodB"),
    ]), "root");
    const result = await layoutEndpointGraph(grouped, "root");
    const methodA = result.nodes.find((item) => item.id === "methodA");
    const methodB = result.nodes.find((item) => item.id === "methodB");
    const methodC = result.nodes.find((item) => item.id === "methodC");
    const serviceGroup = result.nodes.find(
      (item) => item.id === methodB?.parentNode,
    );
    const internalEdge = result.edges.find(
      (item) => item.id === "a-to-b",
    );
    const externalEdge = result.edges.find(
      (item) => item.id === "c-to-b",
    );
    const internalRoute = internalEdge?.data?.route ?? [];
    const externalRoute = externalEdge?.data?.route ?? [];

    expect(methodA?.parentNode).toBe(methodB?.parentNode);
    expect(methodC?.parentNode).not.toBe(methodB?.parentNode);
    expect(internalEdge?.zIndex).toBe(1);
    expect(externalEdge?.zIndex).toBe(0);
    expect(serviceGroup).toBeDefined();
    if (serviceGroup === undefined) {
      throw new Error("Missing routing service group.");
    }
    const groupWidth = typeof serviceGroup.width === "number"
      ? serviceGroup.width
      : 0;
    const groupHeight = typeof serviceGroup.height === "number"
      ? serviceGroup.height
      : 0;
    expect(internalRoute.every((point) =>
      point.x >= serviceGroup.position.x &&
      point.x <= serviceGroup.position.x + groupWidth &&
      point.y >= serviceGroup.position.y &&
      point.y <= serviceGroup.position.y + groupHeight))
      .toBe(true);
    expect(internalRoute.length).toBeGreaterThanOrEqual(2);
    expect(externalRoute.length).toBeGreaterThanOrEqual(2);
    expect(internalRoute[internalRoute.length - 1]).not.toEqual(
      externalRoute[externalRoute.length - 1],
    );
  });

  it("assigns distinct corridors to congested inter-layer edges", async () => {
    const nodes = [
      node("root", "Controller", "controller"),
      node("first", "FirstService", "service"),
      node("second", "SecondService", "service"),
      node("third", "ThirdService", "service"),
    ];
    const grouped = groupEndpointGraph(graph(nodes, [
      edge("to-first", "root", "first"),
      edge("to-second", "root", "second"),
      edge("to-third", "root", "third"),
    ]), "root");
    const result = await layoutEndpointGraph(grouped, "root");
    const verticalXs = result.edges.flatMap((item) =>
      verticalSegmentXs(item.data?.route ?? []));

    expect(new Set(verticalXs).size).toBeGreaterThanOrEqual(2);
  });

  it("lays out an empty filtered graph", async () => {
    const empty = graph([], []);
    const result = await layoutEndpointGraph(
      groupEndpointGraph(empty, "missing"),
      "missing",
    );

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
