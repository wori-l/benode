import type { FrameworkIndex, WorkspaceChangeSet } from "@benode/core";
import * as vscode from "vscode";

import { CachedWorkspaceAnalysisState } from "./analysis/cached-workspace-analysis-state.js";
import { ExtensionWorkspaceAnalyzer } from "./analysis/extension-workspace-analyzer.js";
import type { PackageExclusionSetting } from "./analysis/technology-analysis.js";
import { WorkspaceChangeScheduler } from "./analysis/workspace-change-scheduler.js";
import {
  createCatalog,
  type CatalogNode,
  type EndpointCatalogNode,
} from "./catalog/catalog-model.js";
import type { CatalogTreeProvider } from "./catalog/catalog-tree-provider.js";
import { EXTENSION_DIAGNOSTIC_CODES } from "./diagnostics/diagnostic-store.js";
import type { DiagnosticStore } from "./diagnostics/diagnostic-store.js";
import { EndpointGraphLifecycle } from "./webview/endpoint-graph-lifecycle.js";
import type { EndpointGraphPanel } from "./webview/endpoint-graph-panel.js";

const UPDATE_DEBOUNCE_MS = 150;

function isPackageExclusionSetting(
  value: unknown,
): value is PackageExclusionSetting {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<PackageExclusionSetting>;
  return typeof candidate.parser === "string" &&
    typeof candidate.package === "string";
}

function configuredPackageExclusions(
  resource: vscode.Uri,
): readonly PackageExclusionSetting[] {
  const value = vscode.workspace
    .getConfiguration("benode", resource)
    .get<unknown>("excludedPackages");
  return Array.isArray(value)
    ? value.filter(isPackageExclusionSetting)
    : [];
}

export class BenodeController implements vscode.Disposable {
  readonly #provider: CatalogTreeProvider;
  readonly #treeView: vscode.TreeView<CatalogNode>;
  readonly #diagnostics: DiagnosticStore;
  readonly #endpointGraphs: EndpointGraphLifecycle;
  readonly #analysisState: CachedWorkspaceAnalysisState;
  readonly #workspaceAnalyzer: ExtensionWorkspaceAnalyzer;
  readonly #changeScheduler: WorkspaceChangeScheduler;
  #frameworkIndex: FrameworkIndex | undefined;
  #hasIndexed = false;
  #generation = 0;
  #abortController: AbortController | undefined;

  constructor(
    provider: CatalogTreeProvider,
    treeView: vscode.TreeView<CatalogNode>,
    diagnostics: DiagnosticStore,
    graphPanel: EndpointGraphPanel,
    extensionRootPath: string,
    extensionVersion: string,
    storageUri: vscode.Uri | undefined,
  ) {
    this.#provider = provider;
    this.#treeView = treeView;
    this.#diagnostics = diagnostics;
    this.#endpointGraphs = new EndpointGraphLifecycle(
      graphPanel,
      diagnostics,
    );
    this.#workspaceAnalyzer = new ExtensionWorkspaceAnalyzer(extensionRootPath);
    this.#changeScheduler = new WorkspaceChangeScheduler(
      UPDATE_DEBOUNCE_MS,
      (changes) => void this.reindex(changes),
    );
    this.#analysisState = new CachedWorkspaceAnalysisState(
      storageUri,
      extensionVersion,
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.#diagnostics.report(
          EXTENSION_DIAGNOSTIC_CODES.analysisFailed,
          "Unable to save analysis cache: " + message,
          "warning",
          { stage: "cacheSave" },
        );
      },
    );
  }
  dispose(): void {
    this.#abortController?.abort();
    this.#changeScheduler.dispose();
    this.#workspaceAnalyzer.dispose();
  }

  async reindex(changes?: WorkspaceChangeSet): Promise<void> {
    const { generation, abortController } = this.#beginAnalysis();
    try {
      await this.#runAnalysis(generation, changes, abortController.signal);
    } finally {
      this.#finishAnalysis(generation);
    }
  }

  async cleanAndReindex(): Promise<void> {
    this.#changeScheduler.clear();
    const { generation, abortController } = this.#beginAnalysis();

    try {
      await this.#analysisState.clear();
      abortController.signal.throwIfAborted();
      if (generation === this.#generation) {
        await this.#runAnalysis(generation, undefined, abortController.signal);
      }
    } catch (error: unknown) {
      if (!abortController.signal.aborted && generation === this.#generation) {
        const message = error instanceof Error ? error.message : String(error);
        this.#diagnostics.report(
          EXTENSION_DIAGNOSTIC_CODES.analysisFailed,
          "Unable to clear analysis cache: " + message,
          "error",
          { stage: "cacheClear" },
        );
        this.#endpointGraphs.showAnalysisError(
          "The analysis cache could not be cleared.",
        );
        void vscode.window.showErrorMessage(
          "Benode could not clear the analysis cache: " + message,
        );
      }
    } finally {
      this.#finishAnalysis(generation);
    }
  }

  #beginAnalysis(): {
    readonly generation: number;
    readonly abortController: AbortController;
  } {
    const hadActiveAnalysis = this.#abortController !== undefined;
    this.#abortController?.abort();
    if (hadActiveAnalysis) {
      this.#workspaceAnalyzer.cancelActiveWorker();
    }
    const generation = ++this.#generation;
    this.#endpointGraphs.showLoading();
    const abortController = new AbortController();
    this.#abortController = abortController;
    return { generation, abortController };
  }

  #finishAnalysis(generation: number): void {
    if (generation === this.#generation) {
      this.#abortController = undefined;
    }
  }

  scheduleFileChange(uri: string, deleted: boolean): void {
    this.#changeScheduler.record(uri, deleted);
  }

  async ensureIndexed(): Promise<void> {
    if (!this.#hasIndexed) {
      await this.reindex();
    }
  }

  async #runAnalysis(
    generation: number,
    changes: WorkspaceChangeSet | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder === undefined) {
      this.#diagnostics.info(
        "Workspace analysis skipped because no folder is open.",
      );
      this.#provider.update([]);
      this.#diagnostics.clearAnalysis();
      this.#frameworkIndex = undefined;
      this.#treeView.message = "Open a workspace folder to analyze.";
      this.#endpointGraphs.showUnavailable(
        "Open a workspace folder to analyze this endpoint.",
      );
      return;
    }

    this.#treeView.message = "Analyzing workspace…";
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "Benode: analyzing workspace",
        },
        async (progress) => {
          const previousState = await this.#analysisState.previous();
          const excludedPackages = configuredPackageExclusions(
            workspaceFolder.uri,
          );
          this.#diagnostics.info("Workspace analysis started.", {
            cachedFiles: previousState?.files.length ?? 0,
            changedFiles: changes?.createdOrChangedUris.length ?? 0,
            deletedFiles: changes?.deletedUris.length ?? 0,
            mode: changes === undefined ? "full" : "incremental",
            workspaceUri: workspaceFolder.uri.toString(),
          });
          const analysis = await this.#workspaceAnalyzer.analyze(
            workspaceFolder.uri.toString(),
            previousState,
            changes,
            excludedPackages,
            signal,
            ({ phase, completed, total }) => {
              this.#diagnostics.debug("Workspace analysis progress.", {
                completed, phase, total,
              });
              progress.report({
                message:
                  phase + " " + completed.toString() +
                  "/" + total.toString(),
              });
            },
          );
          signal.throwIfAborted();
          if (generation !== this.#generation) {
            return;
          }

          const { discovery, fileFacts, frameworkIndex, state, timings } =
            analysis;
          this.#diagnostics.info("Workspace discovery completed.", {
            applications: discovery.applications.length,
            diagnostics: discovery.diagnostics.length,
            durationMs: timings.discoveryMs,
          });
          this.#diagnostics.info("Source reading and hashing completed.", {
            durationMs: timings.readAndHashMs,
            files: state.files.length,
          });
          this.#diagnostics.info("Java parsing and indexing completed.", {
            durationMs: timings.indexingMs,
            indexedFiles: timings.indexedFiles,
            reusedFiles: timings.reusedFiles,
          });
          this.#diagnostics.info(
            "Symbol resolution and graph construction completed.",
            {
              durationMs: timings.frameworkIndexMs,
              edges: frameworkIndex.edges.length,
              endpoints: frameworkIndex.endpoints.length,
              files: fileFacts.length,
              nodes: frameworkIndex.nodes.length,
            },
          );

          // This is the publication boundary for “latest wins”: state, catalog
          // and diagnostics move together only after a complete successful run.
          this.#diagnostics.replaceAnalysis([
            ...analysis.discovery.diagnostics,
            ...analysis.frameworkIndex.diagnostics,
          ]);
          this.#frameworkIndex = analysis.frameworkIndex;
          const catalog = createCatalog(analysis.frameworkIndex);
          this.#provider.update(catalog);
          this.#treeView.message =
            catalog.length === 0
              ? "No supported application was found."
              : undefined;
          this.#hasIndexed = true;
          this.#analysisState.publish(analysis.state);
          await this.#endpointGraphs.refresh(analysis.frameworkIndex);
          this.#diagnostics.info("Workspace analysis completed.", {
            diagnostics:
              discovery.diagnostics.length +
              frameworkIndex.diagnostics.length,
            durationMs: timings.totalMs,
          });
        },
      );
    } catch (error: unknown) {
      if (signal.aborted || generation !== this.#generation) {
        this.#diagnostics.info("Workspace analysis cancelled.", {
          generation,
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : String(error);
      this.#treeView.message = this.#frameworkIndex === undefined
        ? "Analysis failed. See Benode output."
        : "Update failed; showing the last valid analysis.";
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.analysisFailed,
        "Analysis failed: " + message,
        "error",
        { stage: "workspaceAnalysis" },
      );
      this.#endpointGraphs.showAnalysisError(
        "The endpoint graph could not be refreshed. The last valid graph remains visible.",
      );
      void vscode.window.showErrorMessage(
        "Benode analysis failed: " + message,
      );
    }
  }

  async openEndpointGraph(node: EndpointCatalogNode): Promise<void> {
    await this.ensureIndexed();
    await this.#endpointGraphs.open(this.#frameworkIndex, node.id);
  }

  showDiagnostics(): void {
    this.#diagnostics.show();
  }
}
