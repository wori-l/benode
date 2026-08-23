import type {
  ReadonlyWorkspaceFileSystem,
  WorkspaceAnalysisFileState,
  WorkspaceAnalysisOptions,
  WorkspaceAnalysisProfile,
  WorkspaceAnalysisState,
  WorkspaceChangeSet,
  WorkspaceDetectionRequest,
} from "../contracts/contracts.js";
import { createContentVersion } from "./content-version.js";
import { relativeUriWithin } from "../source/uri.js";

export interface PendingWorkspaceFile {
  readonly uri: string;
  readonly content: string;
  readonly contentVersion: string;
  readonly discoveryCandidate: boolean;
  readonly previous?: WorkspaceAnalysisFileState;
}

export function requestFingerprint(
  request: WorkspaceDetectionRequest,
): string {
  return JSON.stringify({
    workspaceUri: request.workspaceUri,
    sourceRoots: [...request.sourceRoots],
    excludeGlobs: [...request.excludeGlobs],
    includeGeneratedSources: request.includeGeneratedSources,
  });
}

export function previousFiles(
  state: WorkspaceAnalysisState | undefined,
): ReadonlyMap<string, WorkspaceAnalysisFileState> {
  return new Map(state?.files.map((file) => [file.uri, file]) ?? []);
}

export function isCompatibleAnalysisState(
  request: WorkspaceDetectionRequest,
  profile: WorkspaceAnalysisProfile,
  state: WorkspaceAnalysisState | undefined,
): state is WorkspaceAnalysisState {
  return (
    state !== undefined &&
    state.parserId === profile.parserId &&
    state.requestFingerprint === requestFingerprint(request)
  );
}

export function canReuseDiscovery(
  request: WorkspaceDetectionRequest,
  profile: WorkspaceAnalysisProfile,
  previousState: WorkspaceAnalysisState | undefined,
  changes: WorkspaceChangeSet | undefined,
  changedContents: ReadonlyMap<string, string>,
): previousState is WorkspaceAnalysisState {
  if (
    !isCompatibleAnalysisState(request, profile, previousState) ||
    changes === undefined
  ) {
    return false;
  }

  const previousByUri = previousFiles(previousState);
  return [...changes.createdOrChangedUris, ...changes.deletedUris].every(
    (uri) => {
      if (profile.isDiscoveryDescriptor(uri)) {
        return false;
      }
      const wasCandidate =
        previousByUri.get(uri)?.discoveryCandidate ?? false;
      const content = changedContents.get(uri);
      const isCandidate = content === undefined
        ? false
        : profile.isDiscoveryCandidate(content);
      return !wasCandidate && !isCandidate;
    },
  );
}

function sourceRootFor(
  sourceRoots: readonly string[],
  uri: string,
): string | undefined {
  return sourceRoots.find(
    (candidate) => relativeUriWithin(candidate, uri) !== null,
  );
}

export async function changedContentMap(
  changes: WorkspaceChangeSet | undefined,
  fileSystem: ReadonlyWorkspaceFileSystem,
  signal: AbortSignal | undefined,
): Promise<ReadonlyMap<string, string>> {
  const contents = new Map<string, string>();
  for (const uri of changes?.createdOrChangedUris ?? []) {
    signal?.throwIfAborted();
    try {
      contents.set(uri, await fileSystem.readTextFile(uri));
    } catch {
      // A watcher change can race with deletion. A later discovery or source
      // scan observes the actual filesystem state.
    }
  }
  return contents;
}

export async function sourceFileUris(
  sourceRoots: readonly string[],
  request: WorkspaceDetectionRequest,
  fileSystem: ReadonlyWorkspaceFileSystem,
  profile: WorkspaceAnalysisProfile,
): Promise<readonly string[]> {
  const uris = new Set<string>();
  const excludeGlobs = request.includeGeneratedSources
    ? request.excludeGlobs
    : [...request.excludeGlobs, ...profile.generatedSourceGlobs];
  for (const sourceRoot of sourceRoots) {
    const matches = await fileSystem.findFiles({
      rootUri: sourceRoot,
      includeGlob: profile.sourceFileGlob,
      excludeGlobs,
    });
    matches.forEach((uri) => uris.add(uri));
  }
  return [...uris].sort();
}

export function incrementalUris(
  previousState: WorkspaceAnalysisState,
  changes: WorkspaceChangeSet,
  sourceRoots: readonly string[],
  profile: WorkspaceAnalysisProfile,
): readonly string[] {
  const uris = new Set(previousState.files.map((file) => file.uri));
  changes.deletedUris.forEach((uri) => uris.delete(uri));
  for (const uri of changes.createdOrChangedUris) {
    if (
      profile.isSourceFile(uri) &&
      sourceRootFor(sourceRoots, uri) !== undefined
    ) {
      uris.add(uri);
    }
  }
  return [...uris].sort();
}

export async function readPendingFiles(
  uris: readonly string[],
  previousByUri: ReadonlyMap<string, WorkspaceAnalysisFileState>,
  changedContents: ReadonlyMap<string, string>,
  fileSystem: ReadonlyWorkspaceFileSystem,
  profile: WorkspaceAnalysisProfile,
  options: WorkspaceAnalysisOptions,
  reuseSnapshots: boolean,
): Promise<readonly PendingWorkspaceFile[]> {
  const pending: PendingWorkspaceFile[] = [];
  for (const [index, uri] of uris.entries()) {
    options.signal?.throwIfAborted();
    const previous = previousByUri.get(uri);
    const changedContent = changedContents.get(uri);
    const canReuseSnapshot = reuseSnapshots &&
      previous !== undefined && changedContent === undefined;
    const content = canReuseSnapshot
      ? ""
      : (changedContent ?? await fileSystem.readTextFile(uri));
    pending.push({
      uri,
      content,
      contentVersion: canReuseSnapshot
        ? previous.contentVersion
        : await createContentVersion(content),
      discoveryCandidate: canReuseSnapshot
        ? previous.discoveryCandidate
        : profile.isDiscoveryCandidate(content),
      previous,
    });
    options.onProgress?.({
      phase: "reading",
      completed: index + 1,
      total: uris.length,
    });
  }
  return pending;
}
