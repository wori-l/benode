import { describe, expect, it } from "vitest";

import {
  WorkspaceAnalyzer,
  type FileFacts,
  type FrameworkAdapter,
  type LanguageAdapter,
  type ReadonlyWorkspaceFileSearch,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceAnalysisProfile,
  type WorkspaceDiscoverer,
} from "../src/index.js";

const ROOT = "memory:///workspace";
const SOURCE_ROOT = ROOT + "/src";
const ENTRY_URI = SOURCE_ROOT + "/main.ts";
const SERVICE_URI = SOURCE_ROOT + "/service.ts";

class MemoryFileSystem implements ReadonlyWorkspaceFileSystem {
  readonly files = new Map([
    [ENTRY_URI, "bootstrap()"],
    [SERVICE_URI, "export class Service {}"],
  ]);
  searches = 0;
  reads = 0;

  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    this.searches += 1;
    return [...this.files.keys()].filter(
      (uri) =>
        uri.startsWith(request.rootUri + "/") &&
        uri.endsWith(".ts"),
    );
  }

  async readTextFile(uri: string): Promise<string> {
    this.reads += 1;
    const content = this.files.get(uri);
    if (content === undefined) {
      throw new Error("Missing file: " + uri);
    }
    return content;
  }
}

class TestDiscoverer implements WorkspaceDiscoverer {
  calls = 0;

  async detect() {
    this.calls += 1;
    return {
      applications: [{
        id: "test-app",
        name: "Test",
        rootUri: ROOT,
        sourceRoots: [SOURCE_ROOT],
        entryPoint: {
          name: "bootstrap",
          qualifiedName: "main.bootstrap",
          signature: "main.bootstrap()",
        },
        sourceLocation: {
          uri: ENTRY_URI,
          start: { line: 0, column: 0 },
          end: { line: 0, column: 9 },
        },
      }],
      diagnostics: [],
    };
  }
}

const languageAdapter: LanguageAdapter = {
  async indexFile(request): Promise<FileFacts> {
    return {
      applicationId: request.applicationId,
      uri: request.uri,
      relativeUri: request.relativeUri,
      contentVersion: request.contentVersion,
      namespaceName: null,
      imports: [],
      symbols: [],
      invocations: [],
      diagnostics: [],
    };
  },
};

const frameworkAdapter: FrameworkAdapter = {
  async buildIndex(request) {
    return {
      applications: request.applications,
      endpoints: [],
      nodeFilters: [],
      nodes: [],
      edges: [],
      diagnostics: [],
    };
  },
};

const profile: WorkspaceAnalysisProfile = {
  parserId: "test-typescript",
  sourceFileGlob: "**/*.ts",
  generatedSourceGlobs: ["**/generated/**"],
  isSourceFile: (uri) => uri.endsWith(".ts"),
  isDiscoveryCandidate: (content) => content.includes("bootstrap"),
  isDiscoveryDescriptor: (uri) => uri.endsWith("/package.json"),
};

describe("WorkspaceAnalyzer", () => {
  it("runs and reuses an incremental pipeline without framework knowledge", async () => {
    const fileSystem = new MemoryFileSystem();
    const discoverer = new TestDiscoverer();
    const analyzer = new WorkspaceAnalyzer({
      fileSystem,
      workspaceDiscoverer: discoverer,
      languageAdapter,
      frameworkAdapter,
      profile,
    });

    const cold = await analyzer.analyze({
      workspaceUri: ROOT,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });
    const searchesAfterCold = fileSystem.searches;
    const incremental = await analyzer.analyze({
      workspaceUri: ROOT,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    }, {
      previousState: cold.state,
      changes: { createdOrChangedUris: [], deletedUris: [] },
    });

    expect(cold.fileFacts).toHaveLength(2);
    expect(incremental.frameworkIndex).toEqual(cold.frameworkIndex);
    expect(incremental.state.parserId).toBe(profile.parserId);
    expect(incremental.timings).toMatchObject({
      indexedFiles: 0,
      reusedFiles: 2,
    });
    expect(discoverer.calls).toBe(1);
    expect(fileSystem.searches).toBe(searchesAfterCold);
  });

  it("does not reuse facts across parser identities", async () => {
    const fileSystem = new MemoryFileSystem();
    const request = {
      workspaceUri: ROOT,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    } as const;
    const first = await new WorkspaceAnalyzer({
      fileSystem,
      workspaceDiscoverer: new TestDiscoverer(),
      languageAdapter,
      frameworkAdapter,
      profile,
    }).analyze(request);
    const second = await new WorkspaceAnalyzer({
      fileSystem,
      workspaceDiscoverer: new TestDiscoverer(),
      languageAdapter,
      frameworkAdapter,
      profile: { ...profile, parserId: "another-technology" },
    }).analyze(request, {
      previousState: first.state,
      changes: { createdOrChangedUris: [], deletedUris: [] },
    });

    expect(second.timings).toMatchObject({
      indexedFiles: 2,
      reusedFiles: 0,
    });
  });


  it("rediscovers on technology-defined candidates and descriptors", async () => {
    const fileSystem = new MemoryFileSystem();
    const discoverer = new TestDiscoverer();
    const analyzer = new WorkspaceAnalyzer({
      fileSystem,
      workspaceDiscoverer: discoverer,
      languageAdapter,
      frameworkAdapter,
      profile,
    });
    const request = {
      workspaceUri: ROOT,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    } as const;
    const cold = await analyzer.analyze(request);

    fileSystem.files.set(SERVICE_URI, "bootstrap()");
    const candidate = await analyzer.analyze(request, {
      previousState: cold.state,
      changes: {
        createdOrChangedUris: [SERVICE_URI],
        deletedUris: [],
      },
    });
    await analyzer.analyze(request, {
      previousState: candidate.state,
      changes: {
        createdOrChangedUris: [ROOT + "/package.json"],
        deletedUris: [],
      },
    });

    expect(discoverer.calls).toBe(3);
  });
});
