import {
  type FrameworkIndex,
  type SourceLocation,
} from "@benode/core";
import { describe, expect, it } from "vitest";

import { createCatalog } from "../src/catalog/catalog-model.js";

const location: SourceLocation = {
  uri: "file:///workspace/src/main/java/example/DemoController.java",
  start: { line: 4, column: 13 },
  end: { line: 4, column: 27 },
};

function fixtureIndex(): FrameworkIndex {
  return {
    applications: [
      {
        id: "app",
        name: "DemoApplication",
        rootUri: "file:///workspace",
        sourceRoots: ["file:///workspace/src/main/java"],
        entryPoint: {
          name: "DemoApplication",
          qualifiedName: "example.DemoApplication",
          signature: "type:example.DemoApplication",
        },
        sourceLocation: location,
      },
    ],
    endpoints: [
      {
        id: "endpoint-z",
        applicationId: "app",
        controllerSymbolId: "controller",
        handlerSymbolId: "handler-z",
        httpMethods: ["POST"],
        paths: ["/z"],
        sourceLocation: location,
      },
      {
        id: "endpoint-a",
        applicationId: "app",
        controllerSymbolId: "controller",
        handlerSymbolId: "handler-a",
        httpMethods: ["GET"],
        paths: ["/a"],
        sourceLocation: location,
      },
    ],
    nodeFilters: [],
    nodes: [
      {
        id: "controller",
        role: "controller",
        filterIds: [],
        groupNode: false,
        requiresSourceLocation: true,
        unresolved: false,
        symbol: {
          name: "DemoController",
          qualifiedName: "example.DemoController",
          signature: "type:example.DemoController",
        },
        sourceLocation: location,
        metadata: {},
      },
      {
        id: "handler-z",
        role: "controller",
        filterIds: [],
        groupNode: false,
        requiresSourceLocation: true,
        unresolved: false,
        symbol: {
          name: "create",
          qualifiedName: "example.DemoController#create",
          signature: "example.DemoController#create()",
        },
        sourceLocation: location,
        metadata: {},
      },
      {
        id: "handler-a",
        role: "controller",
        filterIds: [],
        groupNode: false,
        requiresSourceLocation: true,
        unresolved: false,
        symbol: {
          name: "read",
          qualifiedName: "example.DemoController#read",
          signature: "example.DemoController#read()",
        },
        sourceLocation: location,
        metadata: {},
      },
    ],
    edges: [],
    diagnostics: [],
  };
}

describe("createCatalog", () => {
  it("groups a deterministic application/controller/endpoint tree", () => {
    const catalog = createCatalog(fixtureIndex());

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      kind: "application",
      label: "DemoApplication",
    });
    expect(catalog[0]?.controllers[0]).toMatchObject({
      kind: "controller",
      label: "DemoController",
      qualifiedName: "example.DemoController",
    });
    expect(
      catalog[0]?.controllers[0]?.endpoints.map((endpoint) => ({
        label: endpoint.label,
        handlerName: endpoint.handlerName,
      })),
    ).toEqual([
      { label: "GET /a", handlerName: "read" },
      { label: "POST /z", handlerName: "create" },
    ]);
  });
});
