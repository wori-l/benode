import type { WorkspaceAnalysisState } from "@benode/core";
import type * as vscode from "vscode";

import { WorkspaceAnalysisCache } from "./workspace-analysis-cache.js";

export class CachedWorkspaceAnalysisState {
  readonly #cache: WorkspaceAnalysisCache;
  readonly #onSaveError: (error: unknown) => void;
  #current: WorkspaceAnalysisState | undefined;
  #loaded = false;
  #operations: Promise<void> = Promise.resolve();

  constructor(
    storageUri: vscode.Uri | undefined,
    extensionVersion: string,
    onSaveError: (error: unknown) => void,
  ) {
    this.#cache = new WorkspaceAnalysisCache(storageUri, extensionVersion);
    this.#onSaveError = onSaveError;
  }

  async previous(): Promise<WorkspaceAnalysisState | undefined> {
    if (!this.#loaded) {
      this.#current = await this.#cache.load();
      this.#loaded = true;
    }
    return this.#current;
  }

  publish(state: WorkspaceAnalysisState): void {
    this.#current = state;
    // Save and clear share one queue. A slow old save therefore cannot restore
    // a manifest after an explicit Clean and Reindex has removed the cache.
    void this.#enqueue(() => this.#cache.save(state)).catch(this.#onSaveError);
  }

  async clear(): Promise<void> {
    // Mark the empty state as already loaded before disk I/O. A file watcher
    // superseding the clean operation must also start without previous facts.
    this.#current = undefined;
    this.#loaded = true;
    await this.#enqueue(() => this.#cache.clear());
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#operations.then(operation);
    // Recover the internal tail after failure while preserving the rejection
    // returned to the caller responsible for user-facing diagnostics.
    this.#operations = result.catch(() => undefined);
    return result;
  }
}
