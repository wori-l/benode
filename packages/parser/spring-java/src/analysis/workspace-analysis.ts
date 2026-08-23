import {
  WorkspaceAnalyzer,
  type FileFactIndexer,
  type FrameworkAdapter,
  type IndexFileRequest,
  type LanguageAdapter,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceAnalysis,
  type WorkspaceAnalysisOptions,
  type WorkspaceDetectionRequest,
} from "@benode/core";

import { SpringWorkspaceDiscoverer } from "../discovery/spring-workspace-discoverer.js";
import { SpringBootFrameworkAdapter } from "../framework/framework-adapter.js";
import { SPRING_JAVA_WORKSPACE_PROFILE } from "./spring-workspace-profile.js";

export interface SpringWorkspaceAnalyzerDependencies {
  readonly fileSystem: ReadonlyWorkspaceFileSystem;
  readonly languageAdapter?: LanguageAdapter;
  readonly fileFactIndexer?: FileFactIndexer;
  readonly frameworkAdapter?: FrameworkAdapter;
}

function discoveryLanguageAdapter(
  dependencies: SpringWorkspaceAnalyzerDependencies,
  signal: AbortSignal | undefined,
): LanguageAdapter | undefined {
  if (dependencies.languageAdapter !== undefined) {
    return dependencies.languageAdapter;
  }
  const fileFactIndexer = dependencies.fileFactIndexer;
  if (fileFactIndexer === undefined) {
    return undefined;
  }

  return {
    indexFile: async (request: IndexFileRequest) => {
      const facts = await fileFactIndexer.indexFiles(
        [request],
        { signal },
      );
      const first = facts[0];
      if (first === undefined) {
        throw new Error("The file fact indexer omitted discovery facts.");
      }
      return first;
    },
  };
}

export class SpringWorkspaceAnalyzer {
  readonly #dependencies: SpringWorkspaceAnalyzerDependencies;

  constructor(dependencies: SpringWorkspaceAnalyzerDependencies) {
    this.#dependencies = dependencies;
  }

  async analyze(
    request: WorkspaceDetectionRequest,
    options: WorkspaceAnalysisOptions = {},
  ): Promise<WorkspaceAnalysis> {
    const languageAdapter = discoveryLanguageAdapter(
      this.#dependencies,
      options.signal,
    );
    if (languageAdapter === undefined) {
      throw new Error(
        "Workspace analysis requires a language adapter or file fact indexer.",
      );
    }

    return new WorkspaceAnalyzer({
      fileSystem: this.#dependencies.fileSystem,
      languageAdapter: this.#dependencies.languageAdapter,
      fileFactIndexer: this.#dependencies.fileFactIndexer,
      workspaceDiscoverer: new SpringWorkspaceDiscoverer({
        fileSystem: this.#dependencies.fileSystem,
        languageAdapter,
      }),
      frameworkAdapter:
        this.#dependencies.frameworkAdapter ?? new SpringBootFrameworkAdapter(),
      profile: SPRING_JAVA_WORKSPACE_PROFILE,
    }).analyze(request, options);
  }
}
