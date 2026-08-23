import {
  buildSymbolGraph,
  type GraphNode,
  type JsonObject,
} from "@benode/core";

import { entityMetadata } from "./entity-metadata.js";
import { feignMetadata } from "./feign-metadata.js";
import { resolveInvocation } from "./invocation-resolver.js";
import {
  springJavaNodeFilterIds,
  type SpringJavaNodeRole,
} from "./node-filters.js";
import type {
  EndpointRouteMetadata,
} from "@benode/core";
import type { SymbolContext, SymbolIndex } from "./types.js";
import { isLowSignalMethodBehavior } from "../parser/method-behavior.js";

function isExcludedNode(
  node: GraphNode,
  excludedPackages: readonly string[],
): boolean {
  const separator = node.symbol.qualifiedName.indexOf("#");
  const ownerQualifiedName = separator < 0
    ? node.symbol.qualifiedName
    : node.symbol.qualifiedName.slice(0, separator);
  return excludedPackages.some((value) => {
    const pattern = value.trim();
    return pattern.endsWith(".*")
      ? ownerQualifiedName.startsWith(pattern.slice(0, -1))
      : ownerQualifiedName === pattern;
  });
}

function nodeMetadata(
  context: SymbolContext,
  index: SymbolIndex,
  role: SpringJavaNodeRole,
): JsonObject {
  const behavior = context.symbol.metadata["methodBehavior"];
  return {
    ...(role === "entity" ? entityMetadata(context, index) : {}),
    ...(role === "httpClient" ? feignMetadata(context, index) : {}),
    ...(isLowSignalMethodBehavior(behavior)
      ? {
          graphSignal: "low" as const,
          simplificationReason: behavior,
        }
      : {}),
  };
}

export interface GraphBuildResult {
  readonly nodes: ReturnType<typeof buildSymbolGraph>["nodes"];
  readonly edges: ReturnType<typeof buildSymbolGraph>["edges"];
}

export function buildGraph(
  index: SymbolIndex,
  endpointRoutes: ReadonlyMap<string, EndpointRouteMetadata> = new Map(),
  excludedPackages: readonly string[] = [],
): GraphBuildResult {
  const graph = buildSymbolGraph(index, {
    defaultRole: "helper",
    endpointRoutes,
    resolveInvocation,
    nodeMetadata,
    nodeFilterIds: springJavaNodeFilterIds,
    fallback: {
      ambiguousRole: "ambiguous",
      externalRole: "external",
      unresolvedRole: "unresolved",
    },
  });
  const nodes = graph.nodes.filter(
    (node) => !isExcludedNode(node, excludedPackages),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter(
      (edge) =>
        nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId),
    ),
  };
}
