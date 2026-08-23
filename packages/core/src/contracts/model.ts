export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | readonly JsonValue[];

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceLocation {
  readonly uri: string;
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface SymbolDescriptor {
  readonly name: string;
  readonly qualifiedName: string;
  readonly signature: string;
}

export interface ApplicationDescriptor {
  readonly id: string;
  readonly name: string;
  readonly rootUri: string;
  readonly sourceRoots: readonly string[];
  readonly sourceNamespaces?: readonly string[];
  readonly entryPoint: SymbolDescriptor;
  readonly sourceLocation: SourceLocation;
}

export const HTTP_METHODS = [
  "ANY",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface EndpointDescriptor {
  readonly id: string;
  readonly applicationId: string;
  readonly controllerSymbolId: string;
  readonly handlerSymbolId: string;
  readonly httpMethods: readonly HttpMethod[];
  readonly paths: readonly string[];
  readonly sourceLocation: SourceLocation;
}

export type GraphNodeFilterTarget = "group" | "node";

export interface GraphNodeFilter {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly target: GraphNodeFilterTarget;
  readonly defaultSelected: boolean;
}

export const RESOLUTION_CONFIDENCES = [
  "ambiguous",
  "exact",
  "inferred",
  "unresolved",
] as const;

export type ResolutionConfidence =
  (typeof RESOLUTION_CONFIDENCES)[number];

export interface ResolutionEvidence {
  readonly reason: string;
  readonly candidateCount: number;
  readonly sourceLocation?: SourceLocation;
}

export interface GraphNode {
  readonly id: string;
  readonly role: string;
  readonly filterIds: readonly string[];
  readonly groupNode: boolean;
  readonly requiresSourceLocation: boolean;
  readonly unresolved: boolean;
  readonly symbol: SymbolDescriptor;
  readonly sourceLocation?: SourceLocation;
  readonly metadata: JsonObject;
}

export interface GraphEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly confidence: ResolutionConfidence;
  readonly occurrenceCount: number;
  readonly evidence: readonly ResolutionEvidence[];
}

export const DIAGNOSTIC_SEVERITIES = [
  "error",
  "information",
  "warning",
] as const;

export type DiagnosticSeverity =
  (typeof DIAGNOSTIC_SEVERITIES)[number];

export interface AnalysisDiagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly sourceLocation?: SourceLocation;
  readonly details?: JsonObject;
}

export interface EndpointGraph {
  readonly applicationId: string;
  readonly endpointId: string;
  readonly nodeFilters: readonly GraphNodeFilter[];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly diagnostics: readonly AnalysisDiagnostic[];
}
