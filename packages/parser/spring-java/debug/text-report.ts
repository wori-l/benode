import type {
  AnalysisDiagnostic,
  GraphNode,
  SourceLocation,
} from "@benode/core";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { ServiceDebugAnalysis } from "./types.js";

function sourcePath(
  servicePath: string,
  location: SourceLocation,
): string {
  try {
    const path = fileURLToPath(location.uri);
    const relativePath = relative(servicePath, path);
    return (
      (relativePath === "" ? "." : relativePath) +
      ":" +
      (location.start.line + 1).toString() +
      ":" +
      (location.start.column + 1).toString()
    );
  } catch {
    return (
      location.uri +
      ":" +
      (location.start.line + 1).toString() +
      ":" +
      (location.start.column + 1).toString()
    );
  }
}

function nodeLabel(
  node: GraphNode,
  nodesById: ReadonlyMap<string, GraphNode>,
): string {
  const ownerId = node.metadata["ownerSymbolId"];
  if (typeof ownerId !== "string") {
    return node.symbol.qualifiedName;
  }
  const owner = nodesById.get(ownerId);
  return owner === undefined
    ? node.symbol.qualifiedName
    : owner.symbol.name + "#" + node.symbol.name;
}

function diagnosticLine(
  diagnostic: AnalysisDiagnostic,
  servicePath: string,
): string {
  const location =
    diagnostic.sourceLocation === undefined
      ? ""
      : " (" + sourcePath(servicePath, diagnostic.sourceLocation) + ")";
  return (
    "  [" +
    diagnostic.severity.toUpperCase() +
    "] " +
    diagnostic.code +
    ": " +
    diagnostic.message +
    location
  );
}

function roleLines(
  analysis: ServiceDebugAnalysis,
): readonly string[] {
  const typeNodes = analysis.frameworkIndex.nodes.filter(
    (node) => node.metadata["symbolKind"] === "type",
  );
  const roles = new Map<string, GraphNode[]>();
  for (const node of typeNodes) {
    const nodes = roles.get(node.role) ?? [];
    nodes.push(node);
    roles.set(node.role, nodes);
  }

  const lines = ["Components (" + typeNodes.length.toString() + ")"];
  for (const [role, nodes] of [...roles.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    lines.push("  " + role + " (" + nodes.length.toString() + ")");
    for (const node of nodes.sort((left, right) =>
      left.symbol.qualifiedName.localeCompare(
        right.symbol.qualifiedName,
      ),
    )) {
      lines.push("    - " + node.symbol.qualifiedName);
    }
  }
  return lines;
}

function endpointLines(
  analysis: ServiceDebugAnalysis,
  nodesById: ReadonlyMap<string, GraphNode>,
): readonly string[] {
  const endpoints = analysis.frameworkIndex.endpoints;
  const lines = ["Endpoints (" + endpoints.length.toString() + ")"];

  for (const endpoint of endpoints) {
    const handler = nodesById.get(endpoint.handlerSymbolId);
    const label =
      handler === undefined
        ? endpoint.handlerSymbolId
        : nodeLabel(handler, nodesById);
    lines.push(
      "  " +
        endpoint.httpMethods.join("|") +
        " " +
        endpoint.paths.join(", ") +
        " -> " +
        label +
        " (" +
        sourcePath(analysis.servicePath, endpoint.sourceLocation) +
        ")",
    );
  }
  return lines;
}

function flowLines(
  analysis: ServiceDebugAnalysis,
  nodesById: ReadonlyMap<string, GraphNode>,
): readonly string[] {
  const edges = analysis.frameworkIndex.edges;
  const lines = ["Flows (" + edges.length.toString() + ")"];

  for (const edge of edges) {
    const source = nodesById.get(edge.sourceNodeId);
    const target = nodesById.get(edge.targetNodeId);
    lines.push(
      "  " +
        (source === undefined
          ? edge.sourceNodeId
          : nodeLabel(source, nodesById)) +
        " --" +
        edge.confidence +
        (edge.occurrenceCount > 1
          ? " ×" + edge.occurrenceCount.toString()
          : "") +
        "--> " +
        (target === undefined
          ? edge.targetNodeId
          : nodeLabel(target, nodesById)),
    );
  }
  return lines;
}

export function renderTextReport(
  analysis: ServiceDebugAnalysis,
): string {
  const nodesById = new Map(
    analysis.frameworkIndex.nodes.map((node) => [node.id, node]),
  );
  const diagnostics = [
    ...analysis.discovery.diagnostics,
    ...analysis.frameworkIndex.diagnostics,
  ];
  const lines = [
    "Spring/Java service analysis",
    "Service: " + analysis.servicePath,
    "Applications: " +
      analysis.discovery.applications.length.toString(),
    "Indexed Java files: " + analysis.fileFacts.length.toString(),
    "",
  ];

  for (const application of analysis.discovery.applications) {
    lines.push(
      "Application: " + application.entryPoint.qualifiedName,
      "  Root: " + application.rootUri,
      "  Source roots: " + application.sourceRoots.join(", "),
      "",
    );
  }

  lines.push(
    ...endpointLines(analysis, nodesById),
    "",
    ...roleLines(analysis),
    "",
    ...flowLines(analysis, nodesById),
    "",
    "Diagnostics (" + diagnostics.length.toString() + ")",
  );
  if (diagnostics.length === 0) {
    lines.push("  none");
  } else {
    lines.push(
      ...diagnostics.map((diagnostic) =>
        diagnosticLine(diagnostic, analysis.servicePath),
      ),
    );
  }

  return lines.join("\n");
}
