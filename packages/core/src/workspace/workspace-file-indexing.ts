import type {
  FileFactIndexer,
  FileFacts,
  IndexFileRequest,
  WorkspaceAnalysisOptions,
} from "../contracts/contracts.js";
import { relativeUriWithin } from "../source/uri.js";
import type { PendingWorkspaceFile } from "./workspace-file-plan.js";

function relativeUriFrom(
  sourceRoots: readonly string[],
  uri: string,
): string | null {
  for (const sourceRoot of sourceRoots) {
    const relativeUri = relativeUriWithin(sourceRoot, uri);
    if (relativeUri !== null) {
      return relativeUri;
    }
  }
  return null;
}

export async function indexApplicationFiles(
  applicationId: string,
  sourceRoots: readonly string[],
  pendingFiles: readonly PendingWorkspaceFile[],
  indexer: FileFactIndexer,
  options: WorkspaceAnalysisOptions,
  counters: { indexed: number; reused: number },
): Promise<readonly FileFacts[]> {
  const requests: IndexFileRequest[] = [];
  for (const file of pendingFiles) {
    const relativeUri = relativeUriFrom(sourceRoots, file.uri);
    if (relativeUri === null) {
      continue;
    }

    const previousFacts = file.previous?.fileFacts.find(
      (facts) =>
        facts.applicationId === applicationId &&
        facts.contentVersion === file.contentVersion,
    );
    if (previousFacts === undefined) {
      counters.indexed += 1;
    } else {
      counters.reused += 1;
    }
    requests.push({
      applicationId,
      uri: file.uri,
      relativeUri,
      content: file.content,
      contentVersion: file.contentVersion,
      previousFacts,
    });
  }

  let completed = 0;
  return indexer.indexFiles(requests, {
    signal: options.signal,
    onFileIndexed: () => {
      completed += 1;
      options.onProgress?.({
        phase: "indexing",
        completed,
        total: requests.length,
      });
    },
  });
}
