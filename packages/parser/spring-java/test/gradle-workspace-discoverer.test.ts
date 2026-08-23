import {
  createStableApplicationId,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceDetectionRequest,
} from "@benode/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GRADLE_DISCOVERY_DIAGNOSTIC_CODES,
  discoverGradleWorkspace,
  SpringWorkspaceDiscoverer,
  type TreeSitterJavaAdapter,
} from "../src/index.js";
import { createJavaTestAdapter } from "./support/java-adapter.js";
import {
  childUri,
  MemoryFileSystem,
} from "./support/workspace-filesystems.js";

const ROOT = "fixture:///gradle-workspace";
const REQUEST: WorkspaceDetectionRequest = {
  workspaceUri: ROOT,
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

function discoverGradle(
  fileSystem: ReadonlyWorkspaceFileSystem,
) {
  return discoverGradleWorkspace(
    { fileSystem, languageAdapter: adapter },
    REQUEST,
  );
}

function applicationSource(packageName: string, className: string): string {
  return (
    "package " + packageName + ";\n" +
    "import org.springframework.boot.autoconfigure.SpringBootApplication;\n" +
    "@SpringBootApplication class " + className + " {}"
  );
}

describe("discoverGradleWorkspace", () => {
  it.each([
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
  ])("recognizes the %s project marker", async (marker) => {
    const applicationUri = childUri(
      ROOT,
      "src/main/java/sample/SampleApplication.java",
    );
    const result = await discoverGradle(
      new MemoryFileSystem({
        [childUri(ROOT, marker)]: "",
        [applicationUri]: applicationSource(
          "sample",
          "SampleApplication",
        ),
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.applications).toMatchObject([
      {
        id: createStableApplicationId({
          moduleRelativeUri: ".",
          entryPointQualifiedName: "sample.SampleApplication",
        }),
        rootUri: ROOT,
        sourceRoots: [childUri(ROOT, "src/main/java")],
        sourceLocation: { uri: applicationUri },
      },
    ]);
  });

  it("discovers sibling Gradle projects without root settings", async () => {
    const billingRoot = childUri(ROOT, "billing");
    const ordersRoot = childUri(ROOT, "orders");
    const result = await discoverGradle(
      new MemoryFileSystem({
        [childUri(billingRoot, "build.gradle")]: "",
        [childUri(
          billingRoot,
          "src/main/java/billing/BillingApplication.java",
        )]: applicationSource("billing", "BillingApplication"),
        [childUri(ordersRoot, "build.gradle.kts")]: "",
        [childUri(
          ordersRoot,
          "src/main/java/orders/OrdersApplication.java",
        )]: applicationSource("orders", "OrdersApplication"),
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(
      result.applications.map((application) => ({
        name: application.name,
        rootUri: application.rootUri,
      })),
    ).toEqual([
      { name: "BillingApplication", rootUri: billingRoot },
      { name: "OrdersApplication", rootUri: ordersRoot },
    ]);
  });

  it("discovers subprojects declared only in settings", async () => {
    const apiRoot = childUri(ROOT, "services/http-api");
    const result = await discoverGradle(
      new MemoryFileSystem({
        [childUri(ROOT, "settings.gradle.kts")]:
          "include(\"api\")\n" +
          "project(\":api\").projectDir = file(\"services/http-api\")",
        [childUri(
          apiRoot,
          "src/main/java/api/ApiApplication.java",
        )]: applicationSource("api", "ApiApplication"),
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.applications).toMatchObject([
      {
        id: createStableApplicationId({
          moduleRelativeUri: "services/http-api",
          entryPointQualifiedName: "api.ApiApplication",
        }),
        rootUri: apiRoot,
        sourceRoots: [childUri(apiRoot, "src/main/java")],
      },
    ]);
  });

  it("reports a stable diagnostic when no Gradle marker exists", async () => {
    const result = await discoverGradle(
      new MemoryFileSystem({}),
    );

    expect(result.applications).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      GRADLE_DISCOVERY_DIAGNOSTIC_CODES.GRADLE_BUILD_NOT_FOUND,
    ]);
  });

  it("composes Gradle with Maven without an irrelevant missing-POM diagnostic", async () => {
    const fileSystem = new MemoryFileSystem({
      [childUri(ROOT, "settings.gradle.kts")]: "",
      [childUri(
        ROOT,
        "src/main/java/sample/SampleApplication.java",
      )]: applicationSource("sample", "SampleApplication"),
    });
    const result = await new SpringWorkspaceDiscoverer({
      fileSystem,
      languageAdapter: adapter,
    }).detect(REQUEST);

    expect(result.applications).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });
});
