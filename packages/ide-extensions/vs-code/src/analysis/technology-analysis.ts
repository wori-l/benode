import type {
  FileFactIndexer,
  FrameworkAdapter,
  FrameworkBuildRequest,
  FrameworkIndex,
  IndexFileRequest,
  FileFacts,
  ReadonlyWorkspaceFileSystem,
  WorkspaceAnalysis,
  WorkspaceAnalysisOptions,
  WorkspaceDetectionRequest,
} from "@benode/core";

export interface WorkspaceAnalysisRunner {
  analyze(
    request: WorkspaceDetectionRequest,
    options?: WorkspaceAnalysisOptions,
  ): Promise<WorkspaceAnalysis>;
}

export interface PackageExclusionSetting {
  readonly parser: string;
  readonly package: string;
}

export interface TechnologyWorkerRuntime {
  indexFile(request: IndexFileRequest): Promise<FileFacts>;
  buildIndex(
    request: FrameworkBuildRequest,
    excludedPackages?: readonly string[],
  ): Promise<FrameworkIndex>;
  dispose(): void;
}

export interface ExtensionTechnologyAnalysis {
  readonly parserId: string;
  readonly watchGlobs: readonly string[];
  matchesWorkspace(
    fileSystem: ReadonlyWorkspaceFileSystem,
    workspaceUri: string,
  ): Promise<boolean>;
  createWorkspaceAnalyzer(dependencies: {
    readonly fileSystem: ReadonlyWorkspaceFileSystem;
    readonly fileFactIndexer: FileFactIndexer;
    readonly frameworkAdapter: FrameworkAdapter;
  }): WorkspaceAnalysisRunner;
}
