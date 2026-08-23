import {
  createStableApplicationId,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceDetectionRequest,
} from "@benode/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MAVEN_DISCOVERY_DIAGNOSTIC_CODES,
  discoverMavenWorkspace,
  type TreeSitterJavaAdapter,
} from "../src/index.js";
import { createJavaTestAdapter } from "./support/java-adapter.js";
import {
  childUri,
  MemoryFileSystem,
  NodeFixtureFileSystem,
  testServiceFileUri,
  TEST_SERVICE_URI,
} from "./support/workspace-filesystems.js";

const DEFAULT_REQUEST: WorkspaceDetectionRequest = {
  workspaceUri: TEST_SERVICE_URI,
  sourceRoots: [],
  excludeGlobs: [],
  includeGeneratedSources: false,
};

let adapter: TreeSitterJavaAdapter;

beforeAll(async () => {
  adapter = await createJavaTestAdapter();
});

afterAll(() => {
  adapter.dispose();
});

function discover(
  fileSystem: ReadonlyWorkspaceFileSystem,
  request: WorkspaceDetectionRequest = DEFAULT_REQUEST,
) {
  return discoverMavenWorkspace(
    { fileSystem, languageAdapter: adapter },
    request,
  );
}

describe("discoverMavenWorkspace", () => {
  it("discovers the single-module Maven fixture", async () => {
    const result = await discover(
      new NodeFixtureFileSystem(),
    );
    const demoApplicationUri = testServiceFileUri(
      "src/main/java/com/example/demo/DemoApplication.java",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.applications).toEqual([
      {
        id: createStableApplicationId({
          moduleRelativeUri: ".",
          entryPointQualifiedName: "com.example.demo.DemoApplication",
        }),
        name: "DemoApplication",
        rootUri: TEST_SERVICE_URI,
        sourceRoots: [childUri(TEST_SERVICE_URI, "src/main/java")],
        sourceNamespaces: ["com.example.demo"],
        entryPoint: {
          name: "DemoApplication",
          qualifiedName: "com.example.demo.DemoApplication",
          signature: "type:com.example.demo.DemoApplication",
        },
        sourceLocation: {
          uri: demoApplicationUri,
          start: { line: 8, column: 13 },
          end: { line: 8, column: 28 },
        },
      },
    ]);
  });

  it("finds multiple entry points deterministically and rejects an annotation alias", async () => {
    const root = "fixture:///workspace";
    const files = {
      [childUri(root, "pom.xml")]: "<project />",
      [childUri(root, "src/main/java/z/Second.java")]: `
        package z;
        import org.springframework.boot.autoconfigure.*;
        @SpringBootApplication class Second {}
      `,
      [childUri(root, "src/main/java/a/First.java")]: `
        package a;
        @org.springframework.boot.autoconfigure.SpringBootApplication
        class First {}
      `,
      [childUri(root, "src/main/java/custom/NotAnApp.java")]: `
        package custom;
        import custom.annotations.SpringBootApplication;
        @SpringBootApplication class NotAnApp {}
      `,
      [childUri(root, "src/main/java/comment/Marker.java")]: `
        package comment;
        // @SpringBootApplication must not be treated as evidence.
        class Marker {}
      `,
    };

    const result = await discover(new MemoryFileSystem(files), {
      workspaceUri: root,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });

    expect(
      result.applications.map(
        (application) => application.entryPoint.qualifiedName,
      ),
    ).toEqual(["a.First", "z.Second"]);
  });

  it("honors source-root overrides, exclusions, and generated-source settings", async () => {
    const root = "fixture:///workspace";
    const customApp = childUri(root, "custom/java/App.java");
    const generatedApp = childUri(
      root,
      "generated-sources/main/GeneratedApp.java",
    );
    const files = {
      [childUri(root, "pom.xml")]: "<project />",
      [customApp]: `
        import org.springframework.boot.autoconfigure.SpringBootApplication;
        @SpringBootApplication class App {}
      `,
      [childUri(root, "custom/java/excluded/ExcludedApp.java")]: `
        import org.springframework.boot.autoconfigure.SpringBootApplication;
        @SpringBootApplication class ExcludedApp {}
      `,
      [generatedApp]: `
        import org.springframework.boot.autoconfigure.SpringBootApplication;
        @SpringBootApplication class GeneratedApp {}
      `,
      [childUri(root, "src/main/java/DefaultApp.java")]: `
        import org.springframework.boot.autoconfigure.SpringBootApplication;
        @SpringBootApplication class DefaultApp {}
      `,
    };
    const fileSystem = new MemoryFileSystem(files);
    const request = {
      workspaceUri: root,
      sourceRoots: ["custom/java", "generated-sources/main"],
      excludeGlobs: ["**/excluded/**"],
      includeGeneratedSources: false,
    } satisfies WorkspaceDetectionRequest;

    const withoutGenerated = await discover(fileSystem, request);
    expect(
      withoutGenerated.applications.map(
        (application) => application.name,
      ),
    ).toEqual(["App"]);

    const withGenerated = await discover(fileSystem, {
      ...request,
      includeGeneratedSources: true,
    });
    expect(
      withGenerated.applications.map((application) => application.name),
    ).toEqual(["App", "GeneratedApp"]);
  });

  it("returns stable diagnostics for missing evidence and recoverable failures", async () => {
    const root = "fixture:///workspace";
    const unreadable = childUri(root, "src/main/java/Unreadable.java");
    const files = {
      [childUri(root, "pom.xml")]: "<project />",
      [unreadable]: "@SpringBootApplication class Unreadable {}",
      [childUri(root, "src/main/java/Plain.java")]: "class Plain {}",
    };

    const result = await discover(
      new MemoryFileSystem(files, { unreadableUris: [unreadable] }),
      {
        workspaceUri: root,
        sourceRoots: [],
        excludeGlobs: [],
        includeGeneratedSources: false,
      },
    );

    expect(result.applications).toEqual([]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      MAVEN_DISCOVERY_DIAGNOSTIC_CODES.FILE_READ_FAILED,
      MAVEN_DISCOVERY_DIAGNOSTIC_CODES.NO_APPLICATIONS,
    ]);

    const withoutPom = await discover(
      new MemoryFileSystem({}),
      {
        workspaceUri: root,
        sourceRoots: [],
        excludeGlobs: [],
        includeGeneratedSources: false,
      },
    );
    expect(withoutPom.diagnostics.map((item) => item.code)).toEqual([
      MAVEN_DISCOVERY_DIAGNOSTIC_CODES.MAVEN_POM_NOT_FOUND,
    ]);
  });

  it("discovers applications in sibling Maven folders without a root pom", async () => {
    const root = "fixture:///workspace";
    const ordersRoot = childUri(root, "orders");
    const billingRoot = childUri(root, "billing");
    const files = {
      [childUri(ordersRoot, "pom.xml")]: "<project />",
      [childUri(ordersRoot, "src/main/java/orders/OrdersApplication.java")]:
        "package orders;\n" +
        "import org.springframework.boot.autoconfigure.SpringBootApplication;\n" +
        "@SpringBootApplication class OrdersApplication {}",
      [childUri(billingRoot, "pom.xml")]: "<project />",
      [childUri(billingRoot, "src/main/java/billing/BillingApplication.java")]:
        "package billing;\n" +
        "import org.springframework.boot.autoconfigure.SpringBootApplication;\n" +
        "@SpringBootApplication class BillingApplication {}",
    };

    const result = await discover(new MemoryFileSystem(files), {
      workspaceUri: root,
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });

    expect(result.diagnostics).toEqual([]);
    expect(
      result.applications.map((application) => ({
        id: application.id,
        rootUri: application.rootUri,
        sourceRoots: application.sourceRoots,
      })),
    ).toEqual([
      {
        id: createStableApplicationId({
          moduleRelativeUri: "billing",
          entryPointQualifiedName: "billing.BillingApplication",
        }),
        rootUri: billingRoot,
        sourceRoots: [childUri(billingRoot, "src/main/java")],
      },
      {
        id: createStableApplicationId({
          moduleRelativeUri: "orders",
          entryPointQualifiedName: "orders.OrdersApplication",
        }),
        rootUri: ordersRoot,
        sourceRoots: [childUri(ordersRoot, "src/main/java")],
      },
    ]);
  });

});
