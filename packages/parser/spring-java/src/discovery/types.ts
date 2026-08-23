import type {
  LanguageAdapter,
  ReadonlyWorkspaceFileSystem,
} from "@benode/core";

export interface SpringWorkspaceDiscovererDependencies {
  readonly fileSystem: ReadonlyWorkspaceFileSystem;
  readonly languageAdapter: LanguageAdapter;
}
