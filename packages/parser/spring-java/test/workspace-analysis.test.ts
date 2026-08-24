import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getEndpointGraph,
  type ReadonlyWorkspaceFileSearch,
  type ReadonlyWorkspaceFileSystem,
} from "@benode/core";
import {
  SpringWorkspaceAnalyzer,
  type TreeSitterJavaAdapter,
} from "../src/index.js";
import { createJavaTestAdapter } from "./support/java-adapter.js";
import {
  childUri,
  GRADLE_MULTI_APP_URI,
  MemoryFileSystem,
  NodeFixtureFileSystem,
  TEST_SERVICE_URI,
  testServiceFileUri,
} from "./support/workspace-filesystems.js";
let languageAdapter: TreeSitterJavaAdapter;

beforeAll(async () => {
  languageAdapter = await createJavaTestAdapter();
});

const REQUEST = {
  workspaceUri: TEST_SERVICE_URI,
  sourceRoots: [],
  excludeGlobs: [],
  includeGeneratedSources: false,
} as const;

class MutableFixtureFileSystem implements ReadonlyWorkspaceFileSystem {
  readonly #base = new NodeFixtureFileSystem();
  readonly #overrides = new Map<string, string>();
  readonly #deleted = new Set<string>();
  searches = 0;

  update(uri: string, content: string): void {
    this.#overrides.set(uri, content);
    this.#deleted.delete(uri);
  }

  delete(uri: string): void {
    this.#overrides.delete(uri);
    this.#deleted.add(uri);
  }

  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    this.searches += 1;
    const matches = new Set(await this.#base.findFiles(request));
    for (const uri of this.#overrides.keys()) {
      const root = request.rootUri.endsWith("/")
        ? request.rootUri
        : request.rootUri + "/";
      if (!uri.startsWith(root)) {
        continue;
      }
      const relative = uri.slice(root.length);
      if (
        (request.includeGlob === "pom.xml" && relative === "pom.xml") ||
        (request.includeGlob === "**/*.java" && relative.endsWith(".java"))
      ) {
        matches.add(uri);
      }
    }
    this.#deleted.forEach((uri) => matches.delete(uri));
    return [...matches].sort();
  }

  async readTextFile(uri: string): Promise<string> {
    if (this.#deleted.has(uri)) {
      throw new Error("Deleted fixture file: " + uri);
    }
    return this.#overrides.get(uri) ?? this.#base.readTextFile(uri);
  }
}

afterAll(() => {
  languageAdapter.dispose();
});

describe("SpringWorkspaceAnalyzer", () => {
  it("runs discovery, indexing, and framework construction for springboot-srv", async () => {
    const analysis = await new SpringWorkspaceAnalyzer({
      fileSystem: new NodeFixtureFileSystem(),
      languageAdapter,
    }).analyze(REQUEST);

    expect(analysis.discovery.applications).toHaveLength(1);
    expect(analysis.fileFacts).toHaveLength(20);
    expect(analysis.frameworkIndex.applications).toEqual(
      analysis.discovery.applications,
    );
    expect(
      analysis.frameworkIndex.endpoints.map((endpoint) => ({
        methods: endpoint.httpMethods,
        paths: endpoint.paths,
      })),
    ).toEqual([
      { methods: ["POST"], paths: ["/api/v1/data"] },
      { methods: ["DELETE"], paths: ["/api/v1/data/{id}"] },
      { methods: ["POST"], paths: ["/api/v1/backup"] },
      { methods: ["GET"], paths: ["/api/v1/data/{id}"] },
      { methods: ["GET", "HEAD"], paths: ["/api/v1/data"] },
      { methods: ["GET"], paths: ["/api/v1/inner-client"] },
      { methods: ["GET"], paths: ["/api/v1/hello"] },
      { methods: ["PUT"], paths: ["/api/v1/data/{id}"] },
      { methods: ["GET"], paths: ["/demo-routing/data"] },
      { methods: ["GET"], paths: ["/demo-routing/equals"] },
      { methods: ["GET"], paths: ["/demo-routing"] },
      { methods: ["GET"], paths: ["/demo-routing/test"] },
      { methods: ["GET"], paths: ["/lombok"] },
    ]);
    expect(
      JSON.parse(JSON.stringify(analysis.frameworkIndex)),
    ).toEqual(analysis.frameworkIndex);
  });
});

  it("reuses compatible facts without rereading unchanged Java files", async () => {
    const fileSystem = new MutableFixtureFileSystem();
    const analyzer = new SpringWorkspaceAnalyzer({
      fileSystem,
      languageAdapter,
    });
    const cold = await analyzer.analyze(REQUEST);
    const searchesAfterCold = fileSystem.searches;
    const cached = await analyzer.analyze(REQUEST, {
      previousState: cold.state,
      changes: {
        createdOrChangedUris: [],
        deletedUris: [],
      },
    });

    expect(cached.frameworkIndex).toEqual(cold.frameworkIndex);
    expect(cached.state).toEqual(cold.state);
    expect(cached.timings.indexedFiles).toBe(0);
    expect(cached.timings.reusedFiles).toBe(20);
    expect(fileSystem.searches).toBe(searchesAfterCold);
  });

  it("rehashes files before reusing a persisted state without a change set", async () => {
    const fileSystem = new MutableFixtureFileSystem();
    const analyzer = new SpringWorkspaceAnalyzer({
      fileSystem,
      languageAdapter,
    });
    const cold = await analyzer.analyze(REQUEST);
    const serviceUri = testServiceFileUri(
      "src/main/java/com/example/demo/service/DemoService.java",
    );
    fileSystem.update(
      serviceUri,
      (await fileSystem.readTextFile(serviceUri)) + "\n// offline update\n",
    );

    const cachedRestart = await analyzer.analyze(REQUEST, {
      previousState: cold.state,
    });
    const fresh = await analyzer.analyze(REQUEST);

    expect(cachedRestart.frameworkIndex).toEqual(fresh.frameworkIndex);
    expect(cachedRestart.timings.indexedFiles).toBe(1);
    expect(cachedRestart.timings.reusedFiles).toBe(19);
  });

  it("keeps cold and incremental results equivalent across change, add, and delete", async () => {
    const fileSystem = new MutableFixtureFileSystem();
    const analyzer = new SpringWorkspaceAnalyzer({
      fileSystem,
      languageAdapter,
    });
    let incremental = await analyzer.analyze(REQUEST);
    const serviceUri = testServiceFileUri(
      "src/main/java/com/example/demo/service/DemoService.java",
    );
    fileSystem.update(
      serviceUri,
      (await fileSystem.readTextFile(serviceUri)) + "\n// body update\n",
    );

    incremental = await analyzer.analyze(REQUEST, {
      previousState: incremental.state,
      changes: {
        createdOrChangedUris: [serviceUri],
        deletedUris: [],
      },
    });
    let cold = await analyzer.analyze(REQUEST);
    expect(incremental.frameworkIndex).toEqual(cold.frameworkIndex);
    expect(incremental.timings.indexedFiles).toBe(1);
    expect(incremental.timings.reusedFiles).toBe(19);

    const addedUri = testServiceFileUri(
      "src/main/java/com/example/demo/service/AddedService.java",
    );
    fileSystem.update(
      addedUri,
      `package com.example.demo.service;

import org.springframework.stereotype.Service;

@Service
public class AddedService {
  public void run() {}
}
`,
    );
    incremental = await analyzer.analyze(REQUEST, {
      previousState: incremental.state,
      changes: {
        createdOrChangedUris: [addedUri],
        deletedUris: [],
      },
    });
    cold = await analyzer.analyze(REQUEST);
    expect(incremental.frameworkIndex).toEqual(cold.frameworkIndex);
    expect(incremental.fileFacts).toHaveLength(21);

    fileSystem.delete(addedUri);
    incremental = await analyzer.analyze(REQUEST, {
      previousState: incremental.state,
      changes: {
        createdOrChangedUris: [],
        deletedUris: [addedUri],
      },
    });
    cold = await analyzer.analyze(REQUEST);
    expect(incremental.frameworkIndex).toEqual(cold.frameworkIndex);
    expect(incremental.fileFacts).toHaveLength(20);
  });

  it("rediscovers when an entry point candidate changes", async () => {
    const fileSystem = new MutableFixtureFileSystem();
    const analyzer = new SpringWorkspaceAnalyzer({
      fileSystem,
      languageAdapter,
    });
    const cold = await analyzer.analyze(REQUEST);
    const searchesAfterCold = fileSystem.searches;
    const applicationUri = testServiceFileUri(
      "src/main/java/com/example/demo/DemoApplication.java",
    );
    fileSystem.update(
      applicationUri,
      (await fileSystem.readTextFile(applicationUri)) + "\n// candidate changed\n",
    );
    await analyzer.analyze(REQUEST, {
      previousState: cold.state,
      changes: {
        createdOrChangedUris: [applicationUri],
        deletedUris: [],
      },
    });

    expect(fileSystem.searches).toBeGreaterThan(searchesAfterCold);
  });


describe("multi-application workspace analysis", () => {
  it("keeps applications, endpoints, and graph edges isolated", async () => {
    const root = "fixture:///multi-app";
    const sourceRoot = childUri(root, "src/main/java");
    const files = {
      [childUri(root, "pom.xml")]: "<project />",
      [childUri(sourceRoot, "alpha/AlphaApplication.java")]:
        "package alpha;\n" +
        "import org.springframework.boot.autoconfigure.SpringBootApplication;\n" +
        "import org.springframework.context.annotation.ComponentScan;\n" +
        "@SpringBootApplication\n" +
        "@ComponentScan(basePackages={\"alpha\",\"shared\"})\n" +
        "class AlphaApplication {}",
      [childUri(sourceRoot, "alpha/AlphaController.java")]:
        "package alpha;\n" +
        "import shared.SharedService;\n" +
        "import org.springframework.web.bind.annotation.GetMapping;\n" +
        "import org.springframework.web.bind.annotation.RestController;\n" +
        "@RestController class AlphaController {\n" +
        "  private final SharedService service;\n" +
        "  AlphaController(SharedService service) { this.service = service; }\n" +
        "  @GetMapping(\"/alpha\") String alpha() { return service.value(); }\n" +
        "}",
      [childUri(sourceRoot, "beta/BetaApplication.java")]:
        "package beta;\n" +
        "import org.springframework.boot.autoconfigure.SpringBootApplication;\n" +
        "@SpringBootApplication class BetaApplication {}",
      [childUri(sourceRoot, "beta/BetaController.java")]:
        "package beta;\n" +
        "import org.springframework.web.bind.annotation.GetMapping;\n" +
        "import org.springframework.web.bind.annotation.RestController;\n" +
        "@RestController class BetaController {\n" +
        "  private final BetaService service;\n" +
        "  BetaController(BetaService service) { this.service = service; }\n" +
        "  @GetMapping(\"/beta\") String beta() { return service.value(); }\n" +
        "}",
      [childUri(sourceRoot, "beta/BetaService.java")]:
        "package beta;\n" +
        "import org.springframework.stereotype.Service;\n" +
        "@Service public class BetaService {\n" +
        "  public String value() { return \"beta\"; }\n" +
        "}",
      [childUri(sourceRoot, "shared/SharedService.java")]:
        "package shared;\n" +
        "import org.springframework.stereotype.Service;\n" +
        "@Service public class SharedService {\n" +
        "  public String value() { return \"shared\"; }\n" +
        "}",
    };
    const analysis = await new SpringWorkspaceAnalyzer({
      fileSystem: new MemoryFileSystem(files),
      languageAdapter,
    }).analyze({
      workspaceUri: root,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });

    expect(analysis.discovery.applications).toHaveLength(2);
    expect(analysis.fileFacts).toHaveLength(12);
    expect(
      analysis.frameworkIndex.endpoints.map((endpoint) => ({
        applicationId: endpoint.applicationId,
        paths: endpoint.paths,
      })),
    ).toEqual([
      {
        applicationId: analysis.discovery.applications[0]?.id,
        paths: ["/alpha"],
      },
      {
        applicationId: analysis.discovery.applications[1]?.id,
        paths: ["/beta"],
      },
    ]);

    const nodesById = new Map(
      analysis.frameworkIndex.nodes.map((node) => [node.id, node]),
    );
    for (const edge of analysis.frameworkIndex.edges) {
      expect(nodesById.get(edge.sourceNodeId)?.metadata["applicationId"])
        .toBe(nodesById.get(edge.targetNodeId)?.metadata["applicationId"]);
    }

    const alphaEndpoint = analysis.frameworkIndex.endpoints.find(
      (endpoint) => endpoint.paths.includes("/alpha"),
    );
    expect(alphaEndpoint).toBeDefined();
    if (alphaEndpoint === undefined) {
      throw new Error("The alpha endpoint was not indexed.");
    }
    const graph = getEndpointGraph({
      index: analysis.frameworkIndex,
      endpointId: alphaEndpoint.id,
      nodeFilters: [],
      confidences: [],
    });

    expect(
      graph.nodes.every(
        (node) =>
          node.metadata["applicationId"] === alphaEndpoint.applicationId,
      ),
    ).toBe(true);
    expect(
      graph.nodes.some((node) => node.symbol.name === "BetaService"),
    ).toBe(false);
    expect(
      graph.nodes.some(
        (node) =>
          node.symbol.qualifiedName === "shared.SharedService#value",
      ),
    ).toBe(true);
  });
});


describe("Gradle workspace analysis", () => {
  it("runs discovery, indexing, and endpoint construction", async () => {
    const root = "fixture:///gradle-service";
    const sourceRoot = childUri(root, "src/main/java");
    const analysis = await new SpringWorkspaceAnalyzer({
      fileSystem: new MemoryFileSystem({
        [childUri(root, "settings.gradle.kts")]:
          "rootProject.name = \"gradle-service\"",
        [childUri(sourceRoot, "sample/GradleApplication.java")]:
          "package sample;\n" +
          "import org.springframework.boot.autoconfigure.SpringBootApplication;\n" +
          "@SpringBootApplication class GradleApplication {}",
        [childUri(sourceRoot, "sample/GradleController.java")]:
          "package sample;\n" +
          "import org.springframework.web.bind.annotation.GetMapping;\n" +
          "import org.springframework.web.bind.annotation.RestController;\n" +
          "@RestController class GradleController {\n" +
          "  @GetMapping(\"/gradle\") String value() { return \"ok\"; }\n" +
          "}",
      }),
      languageAdapter,
    }).analyze({
      workspaceUri: root,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });

    expect(analysis.discovery.diagnostics).toEqual([]);
    expect(analysis.discovery.applications).toHaveLength(1);
    expect(analysis.fileFacts).toHaveLength(2);
    expect(
      analysis.frameworkIndex.endpoints.map((endpoint) => endpoint.paths),
    ).toEqual([["/gradle"]]);
  });


  it("analyzes the Gradle multi-project fixture as disconnected applications", async () => {
    const analysis = await new SpringWorkspaceAnalyzer({
      fileSystem: new NodeFixtureFileSystem(),
      languageAdapter,
    }).analyze({
      workspaceUri: GRADLE_MULTI_APP_URI,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });

    expect(analysis.discovery.diagnostics).toEqual([]);
    expect(
      analysis.discovery.applications.map((application) => application.name),
    ).toEqual(["BillingApplication", "OrdersApplication"]);
    expect(analysis.fileFacts).toHaveLength(4);
    expect(
      analysis.frameworkIndex.endpoints.map((endpoint) => endpoint.paths),
    ).toEqual([["/billing"], ["/orders"]]);

    const nodesById = new Map(
      analysis.frameworkIndex.nodes.map((node) => [node.id, node]),
    );
    expect(
      analysis.frameworkIndex.edges.every(
        (edge) =>
          nodesById.get(edge.sourceNodeId)?.metadata["applicationId"] ===
          nodesById.get(edge.targetNodeId)?.metadata["applicationId"],
      ),
    ).toBe(true);
  });

});
