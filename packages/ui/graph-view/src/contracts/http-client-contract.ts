import {
  HTTP_METHODS,
  type GraphNode,
  type HttpMethod,
} from "@benode/core";

import type { GraphGroup } from "../graph/graph-grouping.js";

function stringMetadata(
  node: GraphNode | undefined,
  key: "httpClientPaths" | "httpClientUrls",
): readonly string[] {
  const value = node?.metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function httpClientHttpMethods(node: GraphNode): readonly HttpMethod[] {
  const value = node.metadata["httpClientHttpMethods"];
  return Array.isArray(value)
    ? value.filter(
        (method): method is HttpMethod =>
          typeof method === "string" && HTTP_METHODS.some(
            (candidate) => candidate === method,
          ),
      )
    : [];
}

export function httpClientPaths(node: GraphNode): readonly string[] {
  return stringMetadata(node, "httpClientPaths");
}

export function httpClientUrls(group: GraphGroup): readonly string[] {
  const nodes = [group.terminalNode, ...group.methods];
  return [...new Set(
    nodes.flatMap((node) => stringMetadata(node, "httpClientUrls")),
  )].sort((left, right) => left.localeCompare(right));
}
