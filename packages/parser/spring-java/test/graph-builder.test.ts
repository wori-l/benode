import {
  type ApplicationDescriptor,
} from "@benode/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildGraph } from "../src/framework/graph-builder.js";
import { createSymbolIndex } from "../src/framework/symbol-index.js";
import type { TreeSitterJavaAdapter } from "../src/index.js";
import {
  createJavaTestAdapter,
  indexJavaSnippet,
} from "./support/java-adapter.js";

let languageAdapter: TreeSitterJavaAdapter;

beforeAll(async () => {
  languageAdapter = await createJavaTestAdapter();
});

afterAll(() => {
  languageAdapter.dispose();
});

describe("graph builder", () => {
  it("resolves Lombok accessors to generated low-signal method nodes", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;
        import lombok.Data;

        @Data
        class Payload { private String name; }

        class Consumer {
          void run(Payload payload) {
            payload.getName();
            payload.setName("updated");
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const application: ApplicationDescriptor = {
      id: fileFacts.applicationId,
      name: "LombokGraphApplication",
      rootUri: "fixture:///",
      sourceRoots: ["fixture:///src/main/java"],
      entryPoint: entryPoint.symbol,
      sourceLocation: entryPoint.sourceLocation,
    };
    const graph = buildGraph(createSymbolIndex({
      applications: [application],
      fileFacts: [fileFacts],
    }));
    const run = graph.nodes.find((node) => node.symbol.name === "run");
    const accessors = graph.nodes.filter(
      (node) => node.metadata["generatedBy"] === "lombok",
    );

    expect(accessors.every((node) => node.filterIds.includes("trivial")))
      .toBe(true);

    expect(accessors.map((node) => node.symbol.name).sort())
      .toEqual(["getName", "setName"]);
    expect(accessors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          graphSignal: "low",
          simplificationReason: "trivialGetter",
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          graphSignal: "low",
          simplificationReason: "trivialSetter",
        }),
      }),
    ]));
    const runEdges = graph.edges.filter(
      (edge) => edge.sourceNodeId === run?.id,
    );
    expect(runEdges).toHaveLength(2);
    expect(runEdges.map((edge) => edge.targetNodeId).sort())
      .toEqual(accessors.map((accessor) => accessor.id).sort());
  });

  it("represents explicit and implicit constructors as low-signal method nodes", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        class Dependency {
          private String name;
          Dependency(String name) { this.name = name; }
        }

        class Consumer {
          void run() {
            new Dependency("sample");
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }

    const application: ApplicationDescriptor = {
      id: fileFacts.applicationId,
      name: "ConstructorGraphApplication",
      rootUri: "fixture:///",
      sourceRoots: ["fixture:///src/main/java"],
      entryPoint: entryPoint.symbol,
      sourceLocation: entryPoint.sourceLocation,
    };
    const symbolIndex = createSymbolIndex({
      applications: [application],
      fileFacts: [fileFacts],
    });
    const graph = buildGraph(symbolIndex);
    const constructors = fileFacts.symbols.filter(
      (symbol) => symbol.kind === "constructor",
    );
    const dependencyType = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type" && symbol.symbol.name === "Dependency",
    );
    const consumerType = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type" && symbol.symbol.name === "Consumer",
    );
    const dependencyConstructor = constructors.find(
      (symbol) => symbol.ownerSymbolId === dependencyType?.id,
    );
    const consumerConstructor = constructors.find(
      (symbol) => symbol.ownerSymbolId === consumerType?.id,
    );
    const run = graph.nodes.find((node) => node.symbol.name === "run");

    expect(constructors).toHaveLength(2);
    expect(graph.nodes.find((node) => node.id === dependencyConstructor?.id))
      .toMatchObject({
        metadata: {
          symbolKind: "constructor",
          graphSignal: "low",
          simplificationReason: "trivialConstructor",
        },
      });
    expect(graph.nodes.find((node) => node.id === consumerConstructor?.id))
      .toMatchObject({
        metadata: {
          symbolKind: "constructor",
          graphSignal: "low",
          simplificationReason: "trivialConstructor",
          implicit: true,
        },
      });
    expect(graph.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: run?.id,
      targetNodeId: dependencyConstructor?.id,
    }));
  });

  it("resolves super constructor invocations to the matching overload", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        class Parent {
          Parent(int value) {}
          Parent(String value) {}
        }

        class Child extends Parent {
          Child(String value) { super(value); }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const graph = buildGraph(createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "SuperConstructorGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    }));
    const childConstructor = fileFacts.symbols.find(
      (symbol) =>
        symbol.kind === "constructor" &&
        symbol.symbol.signature.endsWith("Child#constructor(String)"),
    );
    const parentStringConstructor = fileFacts.symbols.find(
      (symbol) =>
        symbol.kind === "constructor" &&
        symbol.symbol.signature.endsWith("Parent#constructor(String)"),
    );
    const parentIntConstructor = fileFacts.symbols.find(
      (symbol) =>
        symbol.kind === "constructor" &&
        symbol.symbol.signature.endsWith("Parent#constructor(int)"),
    );

    expect(graph.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: childConstructor?.id,
      targetNodeId: parentStringConstructor?.id,
      confidence: "exact",
    }));
    expect(graph.edges).not.toContainEqual(expect.objectContaining({
      sourceNodeId: childConstructor?.id,
      targetNodeId: parentIntConstructor?.id,
    }));
  });

  it("classifies fallback class-method pairs by available type information", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import com.library.Clock;
        import com.library.File;
        import java.util.*;

        class Payload { Segment variable1; String name; }
        class Segment {
          Result methodB() { return new Result(); }
        }
        class Result { String variable2; }

        class Consumer {
          Payload methodA() { return new Payload(); }

          void run(Clock clock, List values) {
            clock.millis();
            Clock localClock = clock;
            localClock.millis();
            values.size();
            new File("sample.txt");
            missing();
            otherMissing();
            Payload data = new Payload();
            data.name.toString();
            methodA()
              .variable1
              .methodB()
              .variable2
              .toString();
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const symbolIndex = createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "FallbackGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    });
    const graph = buildGraph(symbolIndex);
    const externalClass = graph.nodes.find(
      (node) =>
        node.symbol.qualifiedName === "com.library.Clock" &&
        node.metadata.symbolKind === "type",
    );
    const externalMethod = graph.nodes.find(
      (node) => node.symbol.qualifiedName === "com.library.Clock#millis",
    );
    const externalConstructor = graph.nodes.find(
      (node) => node.symbol.qualifiedName === "com.library.File#<init>",
    );
    const ambiguousClass = graph.nodes.find(
      (node) =>
        node.symbol.qualifiedName === "List" &&
        node.metadata.symbolKind === "type",
    );
    const ambiguousMethod = graph.nodes.find(
      (node) => node.symbol.qualifiedName === "List#size",
    );
    const unknownClasses = graph.nodes.filter(
      (node) =>
        node.symbol.qualifiedName.startsWith("unknown#") &&
        node.metadata.symbolKind === "type",
    );
    const unresolvedMethod = graph.nodes.find(
      (node) => node.symbol.qualifiedName === "unknown#missing#missing",
    );
    const otherUnresolvedMethod = graph.nodes.find(
      (node) =>
        node.symbol.qualifiedName === "unknown#otherMissing#otherMissing",
    );

    expect(externalClass).toMatchObject({ role: "external" });
    expect(externalMethod).toMatchObject({
      role: "external",
      metadata: { ownerSymbolId: externalClass?.id, symbolKind: "method" },
    });
    expect(externalConstructor).toMatchObject({
      role: "external",
      metadata: { symbolKind: "constructor" },
    });
    expect(ambiguousClass).toMatchObject({
      role: "ambiguous",
      filterIds: ["ambiguous"],
      metadata: { namespaceName: null, symbolKind: "type" },
    });
    expect(ambiguousMethod).toMatchObject({
      role: "ambiguous",
      metadata: {
        ownerSymbolId: ambiguousClass?.id,
        namespaceName: null,
        symbolKind: "method",
      },
    });
    expect(unknownClasses).toHaveLength(2);
    expect(unknownClasses.map((node) => node.symbol.name)).toEqual([
      "unknown#missing",
      "unknown#otherMissing",
    ]);
    expect(unresolvedMethod).toMatchObject({
      role: "unresolved",
      metadata: { symbolKind: "method" },
    });
    expect(otherUnresolvedMethod).toMatchObject({
      role: "unresolved",
      metadata: { symbolKind: "method" },
    });
    expect(unresolvedMethod?.metadata.ownerSymbolId)
      .not.toBe(otherUnresolvedMethod?.metadata.ownerSymbolId);
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetNodeId: externalMethod?.id,
        confidence: "inferred",
      }),
      expect.objectContaining({
        targetNodeId: externalConstructor?.id,
        confidence: "inferred",
      }),
      expect.objectContaining({
        targetNodeId: ambiguousMethod?.id,
        confidence: "inferred",
      }),
      expect.objectContaining({
        targetNodeId: unresolvedMethod?.id,
        confidence: "unresolved",
      }),
    ]));
  });

  it("aggregates repeated calls between the same methods", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        class Query {
          Query join(Object value) { return this; }
          Query on(boolean predicate) { return this; }
        }

        class Consumer {
          private Query query;

          void run(Object first, Object second) {
            query
              .join(first).on(true)
              .join(second).on(true);
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const graph = buildGraph(createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "FluentGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    }));
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const run = graph.nodes.find(
      (node) => node.symbol.qualifiedName === "com.example.Consumer#run",
    );
    const onEdges = graph.edges.filter(
      (edge) =>
        edge.sourceNodeId === run?.id &&
        nodesById.get(edge.targetNodeId)?.symbol.name === "on",
    );

    expect(onEdges).toHaveLength(1);
    expect(onEdges[0]?.occurrenceCount).toBe(2);
    expect(onEdges[0]?.evidence).toHaveLength(2);
  });

  it("excludes standard and framework packages from the graph", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import jakarta.persistence.EntityManager;
        import javax.validation.Validator;
        import org.springframework.context.ApplicationContext;

        class Consumer {
          void run(
            String text,
            StringBuilder builder,
            Throwable failure,
            EntityManager entityManager,
            Validator validator,
            ApplicationContext context
          ) {
            text.trim();
            builder.append(text);
            failure.getMessage();
            Integer.valueOf(1);
            entityManager.clear();
            validator.validate(this);
            context.getBean("sample");
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const graph = buildGraph(createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "JavaLangGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    }), new Map(), [
      "java.*",
      "javax.*",
      "jakarta.*",
      "org.springframework.*",
    ]);
    const excludedPrefixes = [
      "java.",
      "javax.",
      "jakarta.",
      "org.springframework.",
    ];

    expect(graph.nodes.some((node) => excludedPrefixes.some(
      (prefix) => node.symbol.qualifiedName.startsWith(prefix),
    ))).toBe(false);
    expect(graph.edges).toEqual([]);
  });

  it("supports exact class and wildcard package exclusions", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import java.time.Clock;
        import java.util.List;
        import java.util.Map;

        class Consumer {
          void run(List values, Map entries, Clock clock) {
            values.size();
            entries.size();
            clock.millis();
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const symbolIndex = createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "ConfigurableExclusionsApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    });
    expect(buildGraph(symbolIndex).nodes.some(
      (node) => node.symbol.qualifiedName === "java.util.List#size",
    )).toBe(true);

    const graph = buildGraph(
      symbolIndex,
      new Map(),
      ["java.util.List", "java.time.*"],
    );

    expect(graph.nodes.some(
      (node) => node.symbol.qualifiedName.startsWith("java.util.List"),
    )).toBe(false);
    expect(graph.nodes.some(
      (node) => node.symbol.qualifiedName.startsWith("java.time."),
    )).toBe(false);
    expect(graph.nodes.some(
      (node) => node.symbol.qualifiedName === "java.util.Map#size",
    )).toBe(true);
  });

  it("creates one edge to the overload selected by argument types", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        class OverloadedService {
          void choose(String value) {}
          void choose(int value) {}
        }

        class ValueSource {
          String value() { return "value"; }
        }

        class Caller {
          private OverloadedService service;
          private ValueSource source;

          void fromParameter(String value) {
            service.choose(value);
          }

          void fromLiteral() {
            service.choose(42);
          }

          void fromReturnedValue() {
            service.choose(source.value());
          }
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }

    const symbolIndex = createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "OverloadGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    });
    const graph = buildGraph(symbolIndex);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

    function targetSignatures(sourceName: string): readonly string[] {
      const source = graph.nodes.find(
        (node) => node.symbol.name === sourceName,
      );
      if (source === undefined) {
        throw new Error("Missing source method " + sourceName);
      }
      return graph.edges
        .filter((edge) => edge.sourceNodeId === source.id)
        .filter((edge) => nodesById.get(edge.targetNodeId)?.symbol.name === "choose")
        .map((edge) => nodesById.get(edge.targetNodeId)?.symbol.signature)
        .filter((signature): signature is string => signature !== undefined);
    }

    expect(targetSignatures("fromParameter")).toEqual([
      "com.example.OverloadedService#method:choose(String):void",
    ]);
    expect(targetSignatures("fromLiteral")).toEqual([
      "com.example.OverloadedService#method:choose(int):void",
    ]);
    expect(targetSignatures("fromReturnedValue")).toEqual([
      "com.example.OverloadedService#method:choose(String):void",
    ]);
  });

  it("excludes a chained call whose imported return type is excluded", async () => {
    const clientFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import java.util.List;

        interface Client {
          List<String> getData();
        }
      `,
      "src/main/java/com/example/Client.java",
    );
    const callerFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        class Caller {
          private Client client;

          void run() {
            this.client.getData().forEach(value -> {});
          }
        }
      `,
      "src/main/java/com/example/Caller.java",
    );
    const entryPoint = callerFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The Java snippet has no type.");
    }
    const graph = buildGraph(createSymbolIndex({
      applications: [{
        id: callerFacts.applicationId,
        name: "ChainedCallApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [clientFacts, callerFacts],
    }), new Map(), ["java.util.*"]);
    const run = graph.nodes.find((node) => node.symbol.name === "run");
    const getData = graph.nodes.find(
      (node) => node.symbol.qualifiedName === "com.example.Client#getData",
    );

    expect(graph.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: run?.id,
      targetNodeId: getData?.id,
      confidence: "inferred",
    }));
    expect(graph.nodes.some(
      (node) => node.symbol.qualifiedName.startsWith("java.util."),
    )).toBe(false);
  });

  it("adds the Feign URL and request mapping to client nodes", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import org.springframework.cloud.openfeign.FeignClient;
        import org.springframework.web.bind.annotation.RequestMapping;
        import org.springframework.web.bind.annotation.RequestMethod;

        @FeignClient(name = "catalog", url = "\${catalog.url}", path = "/api")
        interface CatalogClient {
          @RequestMapping(path = "/items/{id}", method = {
            RequestMethod.GET,
            RequestMethod.HEAD
          })
          String find(String id);
        }
      `,
    );
    const clientType = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (clientType === undefined) {
      throw new Error("The HTTP client type was not parsed.");
    }

    const symbolIndex = createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "FeignGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: clientType.symbol,
        sourceLocation: clientType.sourceLocation,
      }],
      fileFacts: [fileFacts],
    });
    const graph = buildGraph(symbolIndex);
    const typeNode = graph.nodes.find((node) => node.id === clientType.id);
    const methodNode = graph.nodes.find(
      (node) => node.symbol.name === "find",
    );

    expect(typeNode?.metadata).toMatchObject({
      httpClientUrls: ["${catalog.url}/api"],
    });
    expect(methodNode?.metadata).toMatchObject({
      httpClientUrls: ["${catalog.url}/api"],
      httpClientHttpMethods: ["GET", "HEAD"],
      httpClientPaths: ["/items/{id}"],
    });
  });

  it("treats entity calls and constructors like other class calls", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import jakarta.persistence.*;

        @Entity
        @Table(name = "records", schema = "inventory")
        class Record {
          Record() {}
          String getName() { return "record"; }
          String display(Formatter formatter) {
            return formatter.format();
          }
        }

        class Formatter {
          String format() { return "formatted"; }
        }

        class Mapper {
          String read(Record record) {
            return record.getName();
          }

          Record create() {
            return new Record();
          }
        }
      `,
    );
    const recordType = fileFacts.symbols.find(
      (symbol) =>
        symbol.kind === "type" && symbol.symbol.name === "Record",
    );
    if (recordType === undefined) {
      throw new Error("The entity type was not parsed.");
    }

    const symbolIndex = createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "EntityGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: recordType.symbol,
        sourceLocation: recordType.sourceLocation,
      }],
      fileFacts: [fileFacts],
    });
    const graph = buildGraph(symbolIndex);
    const nodeByName = new Map(
      graph.nodes.map((node) => [node.symbol.name, node]),
    );
    const getter = nodeByName.get("getName");
    const display = nodeByName.get("display");
    const format = nodeByName.get("format");
    const read = nodeByName.get("read");
    const create = nodeByName.get("create");

    expect(graph.nodes.find((node) => node.id === recordType.id)?.metadata)
      .toMatchObject({
      entityTables: ["inventory.records"],
    });
    expect(getter).toMatchObject({
      role: "entity",
      metadata: { entityTables: ["inventory.records"] },
    });
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceNodeId: read?.id,
        targetNodeId: getter?.id,
      }),
      expect.objectContaining({
        sourceNodeId: display?.id,
        targetNodeId: format?.id,
      }),
    ]));
    const recordConstructor = fileFacts.symbols.find(
      (symbol) =>
        symbol.kind === "constructor" &&
        symbol.ownerSymbolId === recordType.id,
    );
    expect(graph.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: create?.id,
      targetNodeId: recordConstructor?.id,
    }));
  });

  it("treats repository and Feign method bodies like other methods", async () => {
    const fileFacts = await indexJavaSnippet(
      languageAdapter,
      `
        package com.example;

        import org.springframework.cloud.openfeign.FeignClient;
        import org.springframework.stereotype.Repository;

        class Formatter {
          String format() { return "formatted"; }
        }

        @Repository
        class Store {
          String load(Formatter formatter) {
            return formatter.format();
          }
        }

        @FeignClient(name = "remote")
        interface RemoteClient {
          default String adapt(Formatter formatter) {
            return formatter.format();
          }

          String fetch();
        }
      `,
    );
    const entryPoint = fileFacts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    if (entryPoint === undefined) {
      throw new Error("The graph fixture has no type.");
    }

    const symbolIndex = createSymbolIndex({
      applications: [{
        id: fileFacts.applicationId,
        name: "RoleGraphApplication",
        rootUri: "fixture:///",
        sourceRoots: ["fixture:///src/main/java"],
        entryPoint: entryPoint.symbol,
        sourceLocation: entryPoint.sourceLocation,
      }],
      fileFacts: [fileFacts],
    });
    const graph = buildGraph(symbolIndex);
    const nodeByQualifiedName = new Map(
      graph.nodes.map((node) => [node.symbol.qualifiedName, node]),
    );
    const formatter = nodeByQualifiedName.get(
      "com.example.Formatter#format",
    );
    const load = nodeByQualifiedName.get("com.example.Store#load");
    const adapt = nodeByQualifiedName.get(
      "com.example.RemoteClient#adapt",
    );

    expect(nodeByQualifiedName.get("com.example.Store")).toMatchObject({
      role: "repository",
    });
    expect(load).toMatchObject({ role: "repository" });
    expect(nodeByQualifiedName.get("com.example.RemoteClient"))
      .toMatchObject({ role: "httpClient" });
    expect(adapt).toMatchObject({ role: "httpClient" });
    expect(nodeByQualifiedName.get("com.example.RemoteClient#fetch"))
      .toMatchObject({ role: "httpClient" });
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceNodeId: load?.id,
        targetNodeId: formatter?.id,
      }),
      expect.objectContaining({
        sourceNodeId: adapt?.id,
        targetNodeId: formatter?.id,
      }),
    ]));
  });
});
