import {
  DIAGNOSTIC_SEVERITIES,
  HTTP_METHODS,
  RESOLUTION_CONFIDENCES,
  type EndpointDescriptor,
  type EndpointGraph,
  type GraphEdge,
  type GraphNode,
  type GraphNodeFilter,
  type SourcePosition,
  type SourceLocation,
} from "../contracts/model.js";
import { validateEndpointGraph } from "../graph/validation.js";

const ENDPOINT_GRAPH_ERROR_CODES = [
  "analysisFailed",
  "endpointUnavailable",
] as const;

function isMember<T extends string>(
  value: unknown,
  members: readonly T[],
): value is T {
  return typeof value === "string" && members.some(
    (member) => member === value,
  );
}

function isJsonValue(value: unknown): boolean {
  return value === null || typeof value === "boolean" ||
    typeof value === "number" || typeof value === "string" ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    (isRecord(value) && Object.values(value).every(isJsonValue));
}

export interface ShowEndpointGraphMessage {
  readonly type: "showEndpointGraph";
  readonly endpoint: EndpointDescriptor;
  readonly graph: EndpointGraph;
}

export interface EndpointGraphLoadingMessage {
  readonly type: "endpointGraphLoading";
  readonly message: string;
}

export type EndpointGraphErrorCode =
  (typeof ENDPOINT_GRAPH_ERROR_CODES)[number];

export interface EndpointGraphErrorMessage {
  readonly type: "endpointGraphError";
  readonly code: EndpointGraphErrorCode;
  readonly message: string;
}

export type HostToWebviewMessage =
  | EndpointGraphErrorMessage
  | EndpointGraphLoadingMessage
  | ShowEndpointGraphMessage;

export interface WebviewReadyMessage {
  readonly type: "ready";
}

export interface NavigateToSourceMessage {
  readonly type: "navigateToSource";
  readonly nodeId: string;
}

export type WebviewToHostMessage =
  | NavigateToSourceMessage
  | WebviewReadyMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(
    (entry) => typeof entry === "string",
  );
}

function isPosition(value: unknown): value is SourcePosition {
  return isRecord(value) &&
    Number.isInteger(value.line) && Number(value.line) >= 0 &&
    Number.isInteger(value.column) && Number(value.column) >= 0;
}

function isSourceLocation(value: unknown): value is SourceLocation {
  return isRecord(value) &&
    typeof value.uri === "string" &&
    isPosition(value.start) &&
    isPosition(value.end) &&
    (Number(value.end.line) > Number(value.start.line) ||
      (value.end.line === value.start.line &&
        Number(value.end.column) >= Number(value.start.column)));
}

function isSymbol(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.qualifiedName === "string" &&
    typeof value.signature === "string";
}

function isGraphNode(value: unknown): value is GraphNode {
  return isRecord(value) &&
    typeof value.id === "string" &&
    isNonEmptyString(value.role) &&
    isStringArray(value.filterIds) &&
    typeof value.groupNode === "boolean" &&
    typeof value.requiresSourceLocation === "boolean" &&
    typeof value.unresolved === "boolean" &&
    isSymbol(value.symbol) &&
    (value.sourceLocation === undefined || isSourceLocation(value.sourceLocation)) &&
    isRecord(value.metadata) && isJsonValue(value.metadata);
}

function isGraphNodeFilter(value: unknown): value is GraphNodeFilter {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.section) &&
    (value.target === "group" || value.target === "node") &&
    typeof value.defaultSelected === "boolean";
}

function isEvidence(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.reason === "string" &&
    Number.isInteger(value.candidateCount) &&
    (value.sourceLocation === undefined || isSourceLocation(value.sourceLocation));
}

function isGraphEdge(value: unknown): value is GraphEdge {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceNodeId === "string" &&
    typeof value.targetNodeId === "string" &&
    isMember(value.confidence, RESOLUTION_CONFIDENCES) &&
    typeof value.occurrenceCount === "number" &&
    Number.isInteger(value.occurrenceCount) &&
    value.occurrenceCount > 0 &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidence);
}

function isDiagnostic(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.code === "string" &&
    isMember(value.severity, DIAGNOSTIC_SEVERITIES) &&
    typeof value.message === "string" &&
    (value.sourceLocation === undefined || isSourceLocation(value.sourceLocation)) &&
    (value.details === undefined ||
      (isRecord(value.details) && isJsonValue(value.details)));
}

function isEndpoint(value: unknown): value is EndpointDescriptor {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.applicationId === "string" &&
    typeof value.controllerSymbolId === "string" &&
    typeof value.handlerSymbolId === "string" &&
    Array.isArray(value.httpMethods) &&
    value.httpMethods.every((method) => isMember(method, HTTP_METHODS)) &&
    isStringArray(value.paths) &&
    isSourceLocation(value.sourceLocation);
}

function isEndpointGraph(value: unknown): value is EndpointGraph {
  if (!isRecord(value) ||
    typeof value.applicationId !== "string" ||
    typeof value.endpointId !== "string" ||
    !Array.isArray(value.nodeFilters) ||
    !value.nodeFilters.every(isGraphNodeFilter) ||
    !Array.isArray(value.nodes) ||
    !value.nodes.every(isGraphNode) ||
    !Array.isArray(value.edges) ||
    !value.edges.every(isGraphEdge) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isDiagnostic)) {
    return false;
  }

  const graph = value as unknown as EndpointGraph;
  const filterIds = new Set(graph.nodeFilters.map((filter) => filter.id));
  if (
    filterIds.size !== graph.nodeFilters.length ||
    graph.nodes.some((node) =>
      new Set(node.filterIds).size !== node.filterIds.length ||
      node.filterIds.some((filterId) => !filterIds.has(filterId)))
  ) {
    return false;
  }

  return validateEndpointGraph(graph).valid;
}

export function parseHostToWebviewMessage(
  value: unknown,
): HostToWebviewMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "endpointGraphLoading" &&
    hasOnlyKeys(value, ["type", "message"]) &&
    isNonEmptyString(value.message)) {
    return value as unknown as EndpointGraphLoadingMessage;
  }

  if (value.type === "endpointGraphError" &&
    hasOnlyKeys(value, ["type", "code", "message"]) &&
    isMember(value.code, ENDPOINT_GRAPH_ERROR_CODES) &&
    isNonEmptyString(value.message)) {
    return value as unknown as EndpointGraphErrorMessage;
  }

  if (value.type !== "showEndpointGraph" ||
    !hasOnlyKeys(value, ["type", "endpoint", "graph"]) ||
    !isEndpoint(value.endpoint) ||
    !isEndpointGraph(value.graph) ||
    value.endpoint.id !== value.graph.endpointId ||
    value.endpoint.applicationId !== value.graph.applicationId) {
    return null;
  }

  return value as unknown as ShowEndpointGraphMessage;
}

export function parseWebviewToHostMessage(
  value: unknown,
): WebviewToHostMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "ready" &&
    hasOnlyKeys(value, ["type"])) {
    return value as unknown as WebviewReadyMessage;
  }

  if (value.type === "navigateToSource" &&
    hasOnlyKeys(value, ["type", "nodeId"]) &&
    isNonEmptyString(value.nodeId)) {
    return value as unknown as NavigateToSourceMessage;
  }

  return null;
}
