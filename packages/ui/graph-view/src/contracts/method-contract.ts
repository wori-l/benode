import type { GraphNode } from "@benode/core";

export interface MethodParameter {
  readonly name: string;
  readonly type: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function methodParameters(node: GraphNode): readonly MethodParameter[] {
  const value = node.metadata["parameters"];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((parameter) => {
    if (!isRecord(parameter) || typeof parameter.name !== "string") {
      return [];
    }
    return [{
      name: parameter.name,
      type: typeof parameter.type === "string" && parameter.type.length > 0
        ? parameter.type
        : "unknown",
    }];
  });
}

export function methodOutput(node: GraphNode): string {
  const declaredType = node.metadata["declaredType"];
  return typeof declaredType === "string" && declaredType.length > 0
    ? declaredType
    : "unknown";
}

export function metadataPaths(
  node: GraphNode | undefined,
  key: "endpointBasePaths" | "endpointMethodPaths",
): readonly string[] {
  const value = node?.metadata[key];
  return Array.isArray(value)
    ? value.filter((path): path is string => typeof path === "string")
    : [];
}

export function displayPath(path: string): string {
  return path === "" ? "/" : path;
}
