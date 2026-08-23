import type { WorkspaceChangeSet } from "@benode/core";

export class WorkspaceChangeScheduler {
  readonly #debounceMs: number;
  readonly #onChanges: (changes: WorkspaceChangeSet) => void;
  readonly #changedUris = new Set<string>();
  readonly #deletedUris = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    debounceMs: number,
    onChanges: (changes: WorkspaceChangeSet) => void,
  ) {
    this.#debounceMs = debounceMs;
    this.#onChanges = onChanges;
  }

  record(uri: string, deleted: boolean): void {
    const destination = deleted ? this.#deletedUris : this.#changedUris;
    const opposite = deleted ? this.#changedUris : this.#deletedUris;
    destination.add(uri);
    opposite.delete(uri);
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
    }
    this.#timer = setTimeout(() => this.#flush(), this.#debounceMs);
  }

  clear(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#changedUris.clear();
    this.#deletedUris.clear();
  }

  dispose(): void {
    this.clear();
  }

  #flush(): void {
    this.#timer = undefined;
    const changes: WorkspaceChangeSet = {
      createdOrChangedUris: [...this.#changedUris].sort(),
      deletedUris: [...this.#deletedUris].sort(),
    };
    this.#changedUris.clear();
    this.#deletedUris.clear();
    this.#onChanges(changes);
  }
}
