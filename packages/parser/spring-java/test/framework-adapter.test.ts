import {
  type ApplicationDescriptor,
} from "@benode/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SpringBootFrameworkAdapter,
  type TreeSitterJavaAdapter,
} from "../src/index.js";
import {
  createJavaTestAdapter,
  indexJavaSnippet,
  parseTestService,
} from "./support/java-adapter.js";

let languageAdapter: TreeSitterJavaAdapter;

beforeAll(async () => {
  languageAdapter = await createJavaTestAdapter();
});

afterAll(() => {
  languageAdapter.dispose();
});

describe("SpringBootFrameworkAdapter", () => {
  it("builds mapped endpoints for @Controller classes", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example.demo;

        import org.springframework.stereotype.Controller;
        import org.springframework.web.bind.annotation.GetMapping;
        import org.springframework.web.bind.annotation.RequestMapping;

        @Controller
        @RequestMapping("/api")
        public class PageController {
          @GetMapping("/page")
          public String page(String view) {
            return view;
          }
        }
      `,
      "src/main/java/com/example/demo/PageController.java",
    );
    const controllerType = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    expect(controllerType).toBeDefined();
    if (controllerType === undefined) {
      throw new Error("The @Controller type was not parsed.");
    }

    const application: ApplicationDescriptor = {
      id: fileFacts.applicationId,
      name: "PageApplication",
      rootUri: "fixture:///",
      sourceRoots: ["fixture:///src/main/java"],
      entryPoint: controllerType.symbol,
      sourceLocation: controllerType.sourceLocation,
    };
    const index = await new SpringBootFrameworkAdapter().buildIndex({
      applications: [application],
      fileFacts: [fileFacts],
    });

    expect(index.endpoints).toHaveLength(1);
    expect(index.endpoints[0]).toMatchObject({
      applicationId: fileFacts.applicationId,
      controllerSymbolId: controllerType.id,
      httpMethods: ["GET"],
      paths: ["/api/page"],
    });
    const handler = index.nodes.find(
      (node) => node.id === index.endpoints[0]?.handlerSymbolId,
    );
    expect(handler?.metadata).toMatchObject({
      declaredType: "String",
      parameters: [{ name: "view", type: "String" }],
      endpointBasePaths: ["/api"],
      endpointMethodPaths: ["/page"],
    });
  });

  it("keeps low-signal methods and marks them for graph simplification", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example.demo;

        import org.springframework.web.bind.annotation.GetMapping;
        import org.springframework.web.bind.annotation.RestController;

        @RestController
        class FlowController {
          private final Profile profile;

          FlowController(Profile profile) {
            this.profile = profile;
          }

          @GetMapping("/profile")
          void updateProfile() {
            profile.update("Benode");
          }
        }

        class Profile {
          private String name;

          void update(String input) {
            this.name = input;
          }
        }
      `,
      "src/main/java/com/example/demo/FlowController.java",
    );
    const controllerType = fileFacts.symbols.find(
      (symbol) =>
        symbol.kind === "type" &&
        symbol.symbol.name === "FlowController",
    );
    expect(controllerType).toBeDefined();
    if (controllerType === undefined) {
      throw new Error("The controller type was not parsed.");
    }

    const index = await new SpringBootFrameworkAdapter().buildIndex({
      applications: [
        {
          id: fileFacts.applicationId,
          name: "FlowApplication",
          rootUri: "fixture:///",
          sourceRoots: ["fixture:///src/main/java"],
          entryPoint: controllerType.symbol,
          sourceLocation: controllerType.sourceLocation,
        },
      ],
      fileFacts: [fileFacts],
    });
    const method = index.nodes.find(
      (node) => node.symbol.name === "update",
    );

    expect(index.nodeFilters.map((filter) => filter.id)).toEqual([
      "controller", "service", "repository", "httpClient", "component",
      "helper", "entity", "external", "ambiguous", "unresolved", "trivial",
    ]);
    expect(index.nodeFilters.filter((filter) => filter.defaultSelected)
      .map((filter) => filter.id)).toEqual([
      "controller", "service", "repository", "httpClient",
    ]);
    expect(method?.filterIds).toContain("trivial");
    expect(method?.metadata).toMatchObject({
      graphSignal: "low",
      simplificationReason: "trivialSetter",
    });
    expect(
      index.edges.some((edge) => edge.targetNodeId === method?.id),
    ).toBe(true);
  });

  it("builds endpoint flows for the complete springboot-srv fixture", async () => {
    const fileFacts = await parseTestService(languageAdapter);
    const applicationType = fileFacts
      .flatMap((facts) => facts.symbols)
      .find(
        (symbol) =>
          symbol.kind === "type" &&
          symbol.symbol.qualifiedName ===
            "com.example.demo.DemoApplication",
      );
    expect(applicationType).toBeDefined();
    if (applicationType === undefined) {
      throw new Error("The fixture application type was not parsed.");
    }

    const application: ApplicationDescriptor = {
      id: "springboot-srv",
      name: "DemoApplication",
      rootUri: "fixture:///springboot-srv",
      sourceRoots: [
        "fixture:///springboot-srv/src/main/java",
      ],
      entryPoint: applicationType.symbol,
      sourceLocation: applicationType.sourceLocation,
    };
    const index = await new SpringBootFrameworkAdapter().buildIndex({
      applications: [application],
      fileFacts,
    });

    expect(
      index.endpoints.map((endpoint) => ({
        handler: index.nodes.find(
          (node) => node.id === endpoint.handlerSymbolId,
        )?.symbol.name,
        methods: endpoint.httpMethods,
        paths: endpoint.paths,
      })),
    ).toEqual([
      {
        handler: "addData",
        methods: ["POST"],
        paths: ["/api/v1/data"],
      },
      {
        handler: "deleteData",
        methods: ["DELETE"],
        paths: ["/api/v1/data/{id}"],
      },
      {
        handler: "doBackup",
        methods: ["POST"],
        paths: ["/api/v1/backup"],
      },
      {
        handler: "getDataById",
        methods: ["GET"],
        paths: ["/api/v1/data/{id}"],
      },
      {
        handler: "getDataByName",
        methods: ["GET", "HEAD"],
        paths: ["/api/v1/data"],
      },
      {
        handler: "getInnerClientMessage",
        methods: ["GET"],
        paths: ["/api/v1/inner-client"],
      },
      {
        handler: "hello",
        methods: ["GET"],
        paths: ["/api/v1/hello"],
      },
      {
        handler: "updateData",
        methods: ["PUT"],
        paths: ["/api/v1/data/{id}"],
      },
      {
        handler: "getDataInfo",
        methods: ["GET"],
        paths: ["/demo-routing/data"],
      },
      {
        handler: "getEqualsInfo",
        methods: ["GET"],
        paths: ["/demo-routing/equals"],
      },
      {
        handler: "inspectRoutes",
        methods: ["GET"],
        paths: ["/demo-routing"],
      },
      {
        handler: "testAbstract",
        methods: ["GET"],
        paths: ["/demo-routing/test"],
      },
      {
        handler: "getExample",
        methods: ["GET"],
        paths: ["/lombok"],
      },
    ]);

    const nodeById = new Map(
      index.nodes.map((node) => [node.id, node]),
    );
    const flows = index.edges.map((edge) => ({
      source: nodeById.get(edge.sourceNodeId)?.symbol.qualifiedName,
      target: nodeById.get(edge.targetNodeId)?.symbol.qualifiedName,
      confidence: edge.confidence,
    }));

    expect(flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source:
            "com.example.demo.controller.DemoController#hello",
          target: "com.example.demo.service.DemoService#hello",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source: "com.example.demo.service.DemoService#hello",
          target: "com.example.demo.client.DemoClient#hello",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.DemoService#doBackup",
          target:
            "com.example.demo.repository.DemoRepository#save",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.DemoService#addData",
          target: "com.example.demo.client.DemoClient#postData",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.DemoService#addData",
          target: "com.example.demo.mapper.DataMapper#toEntity",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.DemoService#getDataByName",
          target:
            "com.example.demo.repository.DataJpaRepository#findByName",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.repository.DemoRepository#save",
          target:
            "com.example.demo.models.entities.DataEntity#getName",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.DemoService#addData",
          target:
            "com.example.demo.service.AuditService#recordCreated",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.AuditService#recordCreated",
          target:
            "com.example.demo.repository.AuditRepository#record",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.controller.DemoController#getInnerClientMessage",
          target:
            "com.example.demo.service.NestedClientService#loadMessage",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.controller.LombokController#getExample",
          target: "com.example.demo.service.DemoService#hello",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.controller.LombokController#getExample",
          target:
            "com.example.demo.controller.LombokController.LombokExample#getName",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.controller.LombokController#getExample",
          target:
            "com.example.demo.controller.LombokController.LombokExample#setName",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.NestedClientService#loadMessage",
          target:
            "com.example.demo.service.NestedClientService.NestedFeignClient#fetchMessage",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.AnotherDemoService#test",
          target:
            "com.example.demo.models.payloads.ModelA#doSomething",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.AnotherDemoService#test",
          target:
            "com.example.demo.models.payloads.ModelD#doSomething",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.AnotherDemoService#test",
          target: "java.lang.String#toUpperCase",
          confidence: "inferred",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.AnotherDemoService#methodA",
          target:
            "com.example.demo.service.AnotherDemoService#methodB",
          confidence: "exact",
        }),
        expect.objectContaining({
          source:
            "com.example.demo.service.DemoRoutingCaller#methodC",
          target:
            "com.example.demo.service.AnotherDemoService#methodB",
          confidence: "inferred",
        }),
      ]),
    );

    expect(
      flows
        .filter(
          (flow) =>
            flow.source ===
            "com.example.demo.mapper.DataMapper#toPayload",
        )
        .map((flow) => flow.target)
        .sort(),
    ).toEqual([
      "com.example.demo.models.entities.DataEntity#getId",
      "com.example.demo.models.entities.DataEntity#getName",
      "com.example.demo.models.entities.DataEntity#getValue",
      "com.example.demo.models.payloads.DemoData#<init>",
    ]);
    expect(
      flows.some(
        (flow) =>
          flow.target ===
          "com.example.demo.models.entities.DataEntity",
      ),
    ).toBe(false);

    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.service.NestedClientService#loadMessage",
      ),
    ).toMatchObject({
      role: "service",
      metadata: { namespaceName: "com.example.demo.service" },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.service.NestedClientService.NestedFeignClient",
      ),
    ).toMatchObject({
      role: "httpClient",
      metadata: {
        namespaceName: "com.example.demo.service",
        httpClientUrls: ["http://localhost:3001"],
      },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.service.NestedClientService.NestedFeignClient#fetchMessage",
      ),
    ).toMatchObject({
      role: "httpClient",
      metadata: {
        namespaceName: "com.example.demo.service",
        httpClientUrls: ["http://localhost:3001"],
        httpClientHttpMethods: ["GET"],
        httpClientPaths: ["/message"],
      },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.client.DemoClient",
      ),
    ).toMatchObject({
      role: "httpClient",
      metadata: { httpClientUrls: ["http://localhost:3000"] },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.client.DemoClient#hello",
      ),
    ).toMatchObject({
      role: "httpClient",
      metadata: {
        httpClientUrls: ["http://localhost:3000"],
        httpClientHttpMethods: ["GET"],
        httpClientPaths: ["/hello"],
      },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.models.entities.DataEntity",
      ),
    ).toMatchObject({
      role: "entity",
      metadata: { entityTables: ["data_entity"] },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.models.entities.DataEntity#getId",
      ),
    ).toMatchObject({
      role: "entity",
      metadata: { entityTables: ["data_entity"] },
    });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.mapper.DataMapper",
      ),
    ).toMatchObject({ role: "component" });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.repository.AuditRepository",
      ),
    ).toMatchObject({ role: "repository" });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.repository.DataJpaRepository",
      ),
    ).toMatchObject({ role: "repository" });
    expect(
      index.nodes.find(
        (node) =>
          node.symbol.qualifiedName ===
          "com.example.demo.repository.DataJpaRepository#findByName",
      ),
    ).toMatchObject({ role: "repository" });
    expect(index.diagnostics).toEqual([]);
  });
});
