import type {
  FileFactIndexer,
  FileFacts,
  WorkspaceAnalysis,
  WorkspaceAnalysisOptions,
  WorkspaceAnalysisState,
  WorkspaceAnalyzerDependencies,
  WorkspaceDetectionRequest,
} from "../contracts/contracts.js";
import { indexApplicationFiles } from "./workspace-file-indexing.js";
import {
  canReuseDiscovery,
  changedContentMap,
  incrementalUris,
  isCompatibleAnalysisState,
  previousFiles,
  readPendingFiles,
  requestFingerprint,
  sourceFileUris,
} from "./workspace-file-plan.js";

function elapsed(start: number): number {
  return performance.now() - start;
}

function fileFactIndexerFrom(
  dependencies: WorkspaceAnalyzerDependencies,
): FileFactIndexer | undefined {
  if (dependencies.fileFactIndexer !== undefined) {
    return dependencies.fileFactIndexer;
  }
  const languageAdapter = dependencies.languageAdapter;
  if (languageAdapter === undefined) {
    return undefined;
  }
  return {
    async indexFiles(requests, options = {}) {
      const results: FileFacts[] = [];
      for (const request of requests) {
        options.signal?.throwIfAborted();
        results.push(await languageAdapter.indexFile(request));
        options.onFileIndexed?.();
      }
      return results;
    },
  };
}

export class WorkspaceAnalyzer {
  readonly #dependencies: WorkspaceAnalyzerDependencies;

  constructor(dependencies: WorkspaceAnalyzerDependencies) {
    this.#dependencies = dependencies;
  }

  async analyze(
    request: WorkspaceDetectionRequest,
    options: WorkspaceAnalysisOptions = {},
  ): Promise<WorkspaceAnalysis> {
    const totalStart = performance.now();
    const profile = this.#dependencies.profile;
    const changedContents = await changedContentMap(
      options.changes,
      this.#dependencies.fileSystem,
      options.signal,
    );

    const discoveryStart = performance.now();
    const reuseDiscovery = canReuseDiscovery(
      request,
      profile,
      options.previousState,
      options.changes,
      changedContents,
    );
    const discovery = reuseDiscovery
      ? options.previousState.discovery
      : await this.#dependencies.workspaceDiscoverer.detect(request);
    const discoveryMs = elapsed(discoveryStart);
    options.onProgress?.({
      phase: "discovery",
      completed: 1,
      total: 1,
    });

    options.signal?.throwIfAborted();
    const previousState = isCompatibleAnalysisState(
      request,
      profile,
      options.previousState,
    )
      ? options.previousState
      : undefined;
    const previousByUri = previousFiles(previousState);
    const sourceRoots = discovery.applications.flatMap(
      (application) => application.sourceRoots,
    );
    const readStart = performance.now();
    const uris =
      reuseDiscovery &&
      previousState !== undefined &&
      options.changes !== undefined
        ? incrementalUris(
            previousState,
            options.changes,
            sourceRoots,
            profile,
          )
        : await sourceFileUris(
            sourceRoots,
            request,
            this.#dependencies.fileSystem,
            profile,
          );
    const pendingFiles = await readPendingFiles(
      uris,
      previousByUri,
      changedContents,
      this.#dependencies.fileSystem,
      profile,
      options,
      reuseDiscovery,
    );
    const readAndHashMs = elapsed(readStart);

    const fileFacts: FileFacts[] = [];
    const counters = { indexed: 0, reused: 0 };
    const indexingStart = performance.now();
    const fileFactIndexer = fileFactIndexerFrom(this.#dependencies);
    for (const application of discovery.applications) {
      if (fileFactIndexer === undefined) {
        throw new Error("Workspace analysis requires a file fact indexer.");
      }
      fileFacts.push(
        ...(await indexApplicationFiles(
          application.id,
          application.sourceRoots,
          pendingFiles,
          fileFactIndexer,
          options,
          counters,
        )),
      );
    }
    const indexingMs = elapsed(indexingStart);

    options.signal?.throwIfAborted();
    const frameworkStart = performance.now();
    const frameworkIndex = await this.#dependencies.frameworkAdapter.buildIndex({
      applications: discovery.applications,
      fileFacts,
    });
    const frameworkIndexMs = elapsed(frameworkStart);
    options.onProgress?.({
      phase: "framework",
      completed: 1,
      total: 1,
    });

    const factsByUri = new Map<string, FileFacts[]>();
    for (const facts of fileFacts) {
      const values = factsByUri.get(facts.uri) ?? [];
      values.push(facts);
      factsByUri.set(facts.uri, values);
    }
    const state: WorkspaceAnalysisState = {
      parserId: profile.parserId,
      requestFingerprint: requestFingerprint(request),
      discovery,
      files: pendingFiles.map((file) => ({
        uri: file.uri,
        contentVersion: file.contentVersion,
        discoveryCandidate: file.discoveryCandidate,
        fileFacts: factsByUri.get(file.uri) ?? [],
      })),
    };

    return {
      discovery,
      fileFacts,
      frameworkIndex,
      state,
      timings: {
        discoveryMs,
        readAndHashMs,
        indexingMs,
        frameworkIndexMs,
        totalMs: elapsed(totalStart),
        indexedFiles: counters.indexed,
        reusedFiles: counters.reused,
      },
    };
  }
}
