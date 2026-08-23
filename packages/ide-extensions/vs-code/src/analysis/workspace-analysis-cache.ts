import type { WorkspaceAnalysisState } from "@benode/core";
import * as vscode from "vscode";

const CACHE_DIRECTORY = "analysis-cache";
const CACHE_FILE = "workspace-state.json";

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "FileNotFound";
}

function isWorkspaceAnalysisState(
  value: unknown,
): value is WorkspaceAnalysisState {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<WorkspaceAnalysisState>;
  return (
    typeof candidate.parserId === "string" &&
    typeof candidate.requestFingerprint === "string" &&
    typeof candidate.discovery === "object" &&
    candidate.discovery !== null &&
    Array.isArray(candidate.files) &&
    candidate.files.every(
      (file) =>
        typeof file === "object" &&
        file !== null &&
        typeof file.uri === "string" &&
        typeof file.contentVersion === "string" &&
        typeof file.discoveryCandidate === "boolean" &&
        Array.isArray(file.fileFacts),
    )
  );
}

export class WorkspaceAnalysisCache {
  readonly #root: vscode.Uri | undefined;
  readonly #extensionVersion: string;

  constructor(storageUri: vscode.Uri | undefined, extensionVersion: string) {
    this.#root =
      storageUri === undefined
        ? undefined
        : vscode.Uri.joinPath(storageUri, CACHE_DIRECTORY);
    this.#extensionVersion = extensionVersion;
  }

  #target(): vscode.Uri | undefined {
    return this.#root === undefined
      ? undefined
      : vscode.Uri.joinPath(this.#root, CACHE_FILE);
  }

  async load(): Promise<WorkspaceAnalysisState | undefined> {
    const target = this.#target();
    if (target === undefined) {
      return undefined;
    }

    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(target);
    } catch {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof parsed === "object" && parsed !== null) {
        const cache = parsed as {
          readonly extensionVersion?: unknown;
          readonly state?: unknown;
        };
        if (
          cache.extensionVersion === this.#extensionVersion &&
          isWorkspaceAnalysisState(cache.state)
        ) {
          return cache.state;
        }
      }
    } catch {
      // Invalid JSON follows the same disposable-cache path as an obsolete
      // manifest, so it cannot fail repeatedly on every extension restart.
    }

    // An extension update or invalid manifest starts from an empty cache.
    await this.clear().catch(() => undefined);
    return undefined;
  }

  async clear(): Promise<void> {
    if (this.#root === undefined) {
      return;
    }
    try {
      // Also remove a temporary file left by an interrupted publication.
      await vscode.workspace.fs.delete(this.#root, {
        recursive: true,
        useTrash: false,
      });
    } catch (error: unknown) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }
  }

  async save(state: WorkspaceAnalysisState): Promise<void> {
    const target = this.#target();
    if (target === undefined || this.#root === undefined) {
      return;
    }
    await vscode.workspace.fs.createDirectory(this.#root);
    const temporary = vscode.Uri.joinPath(
      this.#root,
      CACHE_FILE + ".tmp",
    );
    await vscode.workspace.fs.writeFile(
      temporary,
      new TextEncoder().encode(JSON.stringify({
        extensionVersion: this.#extensionVersion,
        state,
      })),
    );
    // Publishing the manifest through rename means a crash can leave either
    // the old complete state or the new complete state, never half-written JSON.
    await vscode.workspace.fs.rename(temporary, target, {
      overwrite: true,
    });
  }
}
