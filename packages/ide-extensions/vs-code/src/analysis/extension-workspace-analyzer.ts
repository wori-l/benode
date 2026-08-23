import type {
  WorkspaceAnalysis,
  WorkspaceAnalysisProgress,
  WorkspaceAnalysisState,
  WorkspaceChangeSet,
} from "@benode/core";

import {
  selectTechnologyAnalysis,
  technologyAnalyses,
} from "./active-technology.js";
import type {
  ExtensionTechnologyAnalysis,
  PackageExclusionSetting,
} from "./technology-analysis.js";
import { WorkerAnalysisService } from "./worker-analysis-service.js";
import { VsCodeWorkspaceFileSystem } from "./vscode-workspace-file-system.js";

export const ANALYSIS_WATCH_GLOBS = [
  ...new Set(
    technologyAnalyses.flatMap((analysis) => analysis.watchGlobs),
  ),
];

function exclusionsForParser(
  configured: readonly PackageExclusionSetting[],
  parserId: string,
): readonly string[] {
  return configured.flatMap((value) => {
    const parser = value.parser.trim();
    const packageName = value.package.trim();
    return parser === parserId && packageName.length > 0
      ? [packageName]
      : [];
  });
}

export class ExtensionWorkspaceAnalyzer {
  readonly #extensionRootPath: string;
  #workerService: WorkerAnalysisService | undefined;
  #workerParserId: string | undefined;

  constructor(extensionRootPath: string) {
    this.#extensionRootPath = extensionRootPath;
  }

  dispose(): void {
    void this.#takeWorkerService()?.dispose();
  }

  cancelActiveWorker(): void {
    this.dispose();
  }

  async analyze(
    workspaceUri: string,
    previousState: WorkspaceAnalysisState | undefined,
    changes: WorkspaceChangeSet | undefined,
    configuredExclusions: readonly PackageExclusionSetting[],
    signal: AbortSignal,
    onProgress: (progress: WorkspaceAnalysisProgress) => void,
  ): Promise<WorkspaceAnalysis> {
    const fileSystem = new VsCodeWorkspaceFileSystem();
    const technology = await selectTechnologyAnalysis(
      fileSystem,
      workspaceUri,
      previousState,
    );
    const excludedPackages = exclusionsForParser(
      configuredExclusions,
      technology.parserId,
    );
    for (let attempt = 0; ; attempt += 1) {
      const service = this.#service(technology);
      try {
        return await technology.createWorkspaceAnalyzer({
          fileSystem,
          fileFactIndexer: service,
          frameworkAdapter: {
            buildIndex: (request) =>
              service.buildIndex(request, excludedPackages),
          },
        }).analyze(
          {
            workspaceUri,
            sourceRoots: [],
            excludeGlobs: [],
            includeGeneratedSources: false,
          },
          {
            previousState,
            changes,
            signal,
            onProgress,
          },
        );
      } catch (error: unknown) {
        if (signal.aborted || attempt > 0) {
          throw error;
        }
        await service.dispose();
        if (this.#workerService === service) {
          this.#workerService = undefined;
          this.#workerParserId = undefined;
        }
      }
    }
  }

  #service(
    technology: ExtensionTechnologyAnalysis,
  ): WorkerAnalysisService {
    if (
      this.#workerService !== undefined &&
      this.#workerParserId !== technology.parserId
    ) {
      void this.#takeWorkerService()?.dispose();
    }
    this.#workerService ??= new WorkerAnalysisService(
      this.#extensionRootPath,
      technology.parserId,
    );
    this.#workerParserId = technology.parserId;
    return this.#workerService;
  }

  #takeWorkerService(): WorkerAnalysisService | undefined {
    const service = this.#workerService;
    this.#workerService = undefined;
    this.#workerParserId = undefined;
    return service;
  }
}
