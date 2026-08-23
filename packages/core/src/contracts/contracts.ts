import type {
  AnalysisDiagnostic,
  ApplicationDescriptor,
  EndpointDescriptor,
  GraphEdge,
  GraphNode,
  GraphNodeFilter,
  JsonObject,
  ResolutionConfidence,
  SourceLocation,
  SymbolDescriptor,
} from "./model.js";

export interface WorkspaceDetectionRequest {
  readonly workspaceUri: string;
  readonly sourceRoots: readonly string[];
  readonly excludeGlobs: readonly string[];
  readonly includeGeneratedSources: boolean;
}

export interface WorkspaceDetectionResult {
  readonly applications: readonly ApplicationDescriptor[];
  readonly diagnostics: readonly AnalysisDiagnostic[];
}

export interface WorkspaceDiscoverer {
  detect(
    request: WorkspaceDetectionRequest,
  ): Promise<WorkspaceDetectionResult>;
}

export interface ReadonlyWorkspaceFileSearch {
  readonly rootUri: string;
  readonly includeGlob: string;
  readonly excludeGlobs: readonly string[];
}

export interface ReadonlyWorkspaceFileSystem {
  findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]>;
  readTextFile(uri: string): Promise<string>;
}

export type IndexedSymbolKind =
  | "constructor"
  | "field"
  | "method"
  | "parameter"
  | "type";

export interface AnnotationArgument {
  readonly name: string | null;
  readonly expression: string;
  readonly sourceLocation: SourceLocation;
}

export interface AnnotationFact {
  readonly name: string;
  readonly arguments: readonly AnnotationArgument[];
  readonly sourceLocation: SourceLocation;
}

export interface IndexedSymbol {
  readonly id: string;
  readonly kind: IndexedSymbolKind;
  readonly ownerSymbolId: string | null;
  readonly symbol: SymbolDescriptor;
  readonly declaredType: string | null;
  readonly modifiers: readonly string[];
  readonly sourceLocation: SourceLocation;
  readonly annotations: readonly AnnotationFact[];
  readonly metadata: JsonObject;
}

export type InvocationKind = "constructor" | "method";

export interface InvocationFact {
  readonly enclosingSymbolId: string;
  readonly kind: InvocationKind;
  readonly expression: string;
  readonly memberName: string;
  readonly receiverExpression: string | null;
  readonly receiverType?: string | null;
  readonly receiverMemberPath?: readonly string[];
  readonly receiverRootExpression?: string;
  readonly argumentCount: number;
  readonly argumentExpressions: readonly string[];
  readonly argumentTypes: readonly (string | null)[];
  readonly sourceLocation: SourceLocation;
}

export interface ImportFact {
  readonly qualifiedName: string;
  readonly isStatic: boolean;
  readonly isWildcard: boolean;
  readonly sourceLocation: SourceLocation;
}

export interface FileFacts {
  readonly applicationId: string;
  readonly uri: string;
  readonly relativeUri: string;
  readonly contentVersion: string;
  readonly namespaceName: string | null;
  readonly imports: readonly ImportFact[];
  readonly symbols: readonly IndexedSymbol[];
  readonly invocations: readonly InvocationFact[];
  readonly diagnostics: readonly AnalysisDiagnostic[];
}

export interface IndexFileRequest {
  readonly applicationId: string;
  readonly uri: string;
  readonly relativeUri: string;
  readonly content: string;
  readonly contentVersion: string;
  readonly previousFacts?: FileFacts;
}

export interface LanguageAdapter {
  indexFile(request: IndexFileRequest): Promise<FileFacts>;
}

export interface FileFactIndexOptions {
  readonly signal?: AbortSignal;
  readonly onFileIndexed?: () => void;
}

export interface FileFactIndexer {
  indexFiles(
    requests: readonly IndexFileRequest[],
    options?: FileFactIndexOptions,
  ): Promise<readonly FileFacts[]>;
}

export interface FrameworkIndex {
  readonly applications: readonly ApplicationDescriptor[];
  readonly endpoints: readonly EndpointDescriptor[];
  readonly nodeFilters: readonly GraphNodeFilter[];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly diagnostics: readonly AnalysisDiagnostic[];
}

export interface FrameworkBuildRequest {
  readonly applications: readonly ApplicationDescriptor[];
  readonly fileFacts: readonly FileFacts[];
}

export interface FrameworkAdapter {
  buildIndex(request: FrameworkBuildRequest): Promise<FrameworkIndex>;
}

export interface WorkspaceChangeSet {
  readonly createdOrChangedUris: readonly string[];
  readonly deletedUris: readonly string[];
}

export interface WorkspaceAnalysisFileState {
  readonly uri: string;
  readonly contentVersion: string;
  readonly discoveryCandidate: boolean;
  readonly fileFacts: readonly FileFacts[];
}

export interface WorkspaceAnalysisState {
  readonly parserId: string;
  readonly requestFingerprint: string;
  readonly discovery: WorkspaceDetectionResult;
  readonly files: readonly WorkspaceAnalysisFileState[];
}

export interface WorkspaceAnalysisTimings {
  readonly discoveryMs: number;
  readonly readAndHashMs: number;
  readonly indexingMs: number;
  readonly frameworkIndexMs: number;
  readonly totalMs: number;
  readonly indexedFiles: number;
  readonly reusedFiles: number;
}

export interface WorkspaceAnalysisProgress {
  readonly phase: "discovery" | "reading" | "indexing" | "framework";
  readonly completed: number;
  readonly total: number;
}

export interface WorkspaceAnalysisOptions {
  readonly previousState?: WorkspaceAnalysisState;
  readonly changes?: WorkspaceChangeSet;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: WorkspaceAnalysisProgress) => void;
}

export interface WorkspaceAnalysis {
  readonly discovery: WorkspaceDetectionResult;
  readonly fileFacts: readonly FileFacts[];
  readonly frameworkIndex: FrameworkIndex;
  readonly state: WorkspaceAnalysisState;
  readonly timings: WorkspaceAnalysisTimings;
}

export interface WorkspaceAnalysisProfile {
  readonly parserId: string;
  readonly sourceFileGlob: string;
  readonly generatedSourceGlobs: readonly string[];
  isSourceFile(uri: string): boolean;
  isDiscoveryCandidate(content: string): boolean;
  isDiscoveryDescriptor(uri: string): boolean;
}

export interface WorkspaceAnalyzerDependencies {
  readonly fileSystem: ReadonlyWorkspaceFileSystem;
  readonly workspaceDiscoverer: WorkspaceDiscoverer;
  readonly frameworkAdapter: FrameworkAdapter;
  readonly profile: WorkspaceAnalysisProfile;
  readonly languageAdapter?: LanguageAdapter;
  readonly fileFactIndexer?: FileFactIndexer;
}

export interface EndpointGraphRequest {
  readonly index: FrameworkIndex;
  readonly endpointId: string;
  readonly nodeFilters: readonly string[];
  readonly confidences: readonly ResolutionConfidence[];
}
