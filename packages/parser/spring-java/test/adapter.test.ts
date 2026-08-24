import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TreeSitterJavaAdapter } from "../src/index.js";
import {
  createJavaTestAdapter,
  indexJavaSnippet,
} from "./support/java-adapter.js";

let adapter: TreeSitterJavaAdapter;

async function indexJava(
  content: string,
  relativeUri = "src/main/java/com/example/Demo.java",
) {
  return indexJavaSnippet(adapter, content, relativeUri);
}

beforeAll(async () => {
  adapter = await createJavaTestAdapter();
});

afterAll(() => {
  adapter.dispose();
});

describe("TreeSitterJavaAdapter", () => {
  it("extracts package and regular, static, and wildcard imports", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      import java.util.List;
      import static java.util.Collections.*;
      class Demo {}
    `);

    expect(facts.namespaceName).toBe("com.example.demo");
    expect(
      facts.imports.map(
        ({ qualifiedName, isStatic, isWildcard }) => ({
          qualifiedName,
          isStatic,
          isWildcard,
        }),
      ),
    ).toEqual([
      {
        qualifiedName: "java.util.List",
        isStatic: false,
        isWildcard: false,
      },
      {
        qualifiedName: "java.util.Collections",
        isStatic: true,
        isWildcard: true,
      },
    ]);
  });

  it("extracts owned symbols, annotations, modifiers, and overloads", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      @Controller
      public class Demo {
        @Autowired private final Service service;

        @GetMapping(value = "/items")
        public String find(@RequestParam String name) { return name; }

        public String find(int id) { return String.valueOf(id); }
      }
    `);

    const type = facts.symbols.find(
      (symbol) => symbol.kind === "type",
    );
    const field = facts.symbols.find(
      (symbol) => symbol.kind === "field",
    );
    const methods = facts.symbols.filter(
      (symbol) => symbol.kind === "method" && symbol.symbol.name === "find",
    );

    expect(type).toMatchObject({
      ownerSymbolId: null,
      modifiers: ["public"],
      annotations: [{ name: "Controller", arguments: [] }],
      metadata: { declarationKind: "class" },
    });
    expect(field).toMatchObject({
      ownerSymbolId: type?.id,
      declaredType: "Service",
      modifiers: ["private", "final"],
      annotations: [{ name: "Autowired", arguments: [] }],
    });
    expect(methods).toHaveLength(2);
    expect(new Set(methods.map((method) => method.id)).size).toBe(2);
    expect(methods[0]?.annotations[0]?.arguments[0]).toMatchObject({
      name: "value",
      expression: "\"/items\"",
    });

    const parameter = facts.symbols.find(
      (symbol) =>
        symbol.kind === "parameter" && symbol.symbol.name === "name",
    );
    expect(parameter).toMatchObject({
      ownerSymbolId: methods[0]?.id,
      declaredType: "String",
      annotations: [{ name: "RequestParam", arguments: [] }],
      metadata: { index: 0 },
    });
  });

  it("extracts chained, lambda, and constructor invocations", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      class Demo {
        void run() {
          source.items().stream().forEach(item -> save(new Entity(item.name())));
        }
        void save(Entity entity) {}
      }
    `);

    expect(
      facts.invocations.map(
        ({ kind, memberName, receiverExpression, argumentCount }) => ({
          kind,
          memberName,
          receiverExpression,
          argumentCount,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          kind: "method",
          memberName: "items",
          receiverExpression: "source",
          argumentCount: 0,
        },
        {
          kind: "method",
          memberName: "stream",
          receiverExpression: "source.items()",
          argumentCount: 0,
        },
        {
          kind: "method",
          memberName: "forEach",
          receiverExpression: "source.items().stream()",
          argumentCount: 1,
        },
        {
          kind: "method",
          memberName: "name",
          receiverExpression: "item",
          argumentCount: 0,
        },
        {
          kind: "constructor",
          memberName: "Entity",
          receiverExpression: null,
          argumentCount: 1,
        },
        {
          kind: "method",
          memberName: "save",
          receiverExpression: null,
          argumentCount: 1,
        },
      ]),
    );

    const run = facts.symbols.find(
      (symbol) =>
        symbol.kind === "method" && symbol.symbol.name === "run",
    );
    expect(
      facts.invocations.every(
        (invocation) =>
          invocation.memberName === "save" ||
          invocation.enclosingSymbolId === run?.id,
      ),
    ).toBe(true);
  });

  it("classifies only trivial property methods as low signal", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      abstract class ProfileBuilder {
        private String name;
        private boolean active;

        String label() { return name; }
        boolean enabled() { return this.active; }
        void update(String input) { this.name = input; }
        ProfileBuilder named(String input) {
          this.name = input;
          return this;
        }

        String computed() { return name.trim(); }
        void validated(String input) {
          require(input);
          this.name = input;
        }
        void mutateBoth(String input) {
          this.name = input;
          this.active = true;
        }
        abstract String missing();
        abstract void require(String input);
      }
    `);

    const behaviors = new Map(
      facts.symbols
        .filter((symbol) => symbol.kind === "method")
        .map((method) => [
          method.symbol.name,
          method.metadata["methodBehavior"],
        ]),
    );

    expect(behaviors.get("label")).toBe("trivialGetter");
    expect(behaviors.get("enabled")).toBe("trivialGetter");
    expect(behaviors.get("update")).toBe("trivialSetter");
    expect(behaviors.get("named")).toBe("trivialFluentSetter");
    expect(behaviors.get("computed")).toBeUndefined();
    expect(behaviors.get("validated")).toBeUndefined();
    expect(behaviors.get("mutateBoth")).toBeUndefined();
    expect(behaviors.get("missing")).toBeUndefined();
  });

  it("synthesizes Lombok accessors as low-signal methods", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      import lombok.AccessLevel;
      import lombok.Data;
      import lombok.Getter;
      import lombok.Setter;
      import lombok.Value;

      @Data
      class Profile {
        private String name;
        private final int id = 1;
        private boolean active;
        public void setName(String ignored) {}
      }

      @Value
      class Token { String value; }

      class Fields {
        @Getter private String title;
        @Setter private int count;
        @Getter(AccessLevel.NONE) private String secret;
      }
    `);
    const typesById = new Map(
      facts.symbols
        .filter((symbol) => symbol.kind === "type")
        .map((type) => [type.id, type.symbol.name]),
    );
    const methods = facts.symbols.filter(
      (symbol) => symbol.kind === "method",
    );
    const generatedNames = methods
      .filter((method) => method.metadata["generatedBy"] === "lombok")
      .map((method) => typesById.get(method.ownerSymbolId ?? "") + "." +
        method.symbol.name)
      .sort();

    expect(generatedNames).toEqual([
      "Fields.getTitle",
      "Fields.setCount",
      "Profile.getId",
      "Profile.getName",
      "Profile.isActive",
      "Profile.setActive",
      "Token.getValue",
    ]);
    expect(methods.find((method) => method.symbol.name === "getName")?.metadata)
      .toMatchObject({
        generatedBy: "lombok",
        implicit: true,
        methodBehavior: "trivialGetter",
      });
    expect(methods.find((method) => method.symbol.name === "setActive")?.metadata)
      .toMatchObject({
        generatedBy: "lombok",
        implicit: true,
        methodBehavior: "trivialSetter",
      });
    expect(methods.find((method) => method.symbol.name === "setName")?.metadata[
      "generatedBy"
    ]).toBeUndefined();
  });

  it("extracts explicit and implicit constructors as low-signal callables", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      class Implicit {}
      class Explicit { Explicit() {} }
      class Assignments {
        private String name;
        private int count;
        Assignments(String name, int inputCount) {
          this.name = name;
          count = inputCount;
        }
      }
      class NonTrivial {
        private String name;
        NonTrivial(String name) {
          this.name = name;
          initialize();
        }
        void initialize() {}
      }
    `);
    const constructors = facts.symbols.filter(
      (symbol) => symbol.kind === "constructor",
    );
    const byOwnerName = new Map(constructors.map((constructor) => {
      const owner = facts.symbols.find(
        (symbol) => symbol.id === constructor.ownerSymbolId,
      );
      return [owner?.symbol.name, constructor];
    }));

    expect(constructors).toHaveLength(4);
    expect(byOwnerName.get("Implicit")?.metadata).toMatchObject({
      declarationKind: "constructor",
      methodBehavior: "trivialConstructor",
      implicit: true,
    });
    expect(byOwnerName.get("Explicit")?.metadata).toMatchObject({
      declarationKind: "constructor",
      methodBehavior: "trivialConstructor",
    });
    expect(byOwnerName.get("Explicit")?.metadata["implicit"])
      .toBeUndefined();
    expect(byOwnerName.get("Assignments")?.metadata).toMatchObject({
      declarationKind: "constructor",
      methodBehavior: "trivialConstructor",
    });
    expect(byOwnerName.get("NonTrivial")?.metadata["methodBehavior"])
      .toBeUndefined();
  });

  it("returns partial facts and syntax diagnostics for invalid Java", async () => {
    const facts = await indexJava(
      "package com.example; class Broken { void run( { call(); }",
    );

    expect(facts.namespaceName).toBe("com.example");
    expect(facts.diagnostics).not.toHaveLength(0);
    expect(
      facts.diagnostics.every(
        (diagnostic) => diagnostic.code === "java.syntaxError",
      ),
    ).toBe(true);
  });

  it("converts byte columns to zero-based UTF-16 columns", async () => {
    const content =
      "package com.example; class Demo { String é; void run() {} }";
    const facts = await indexJava(content);
    const run = facts.symbols.find(
      (symbol) =>
        symbol.kind === "method" && symbol.symbol.name === "run",
    );

    expect(run?.sourceLocation.start).toEqual({
      line: 0,
      column: content.indexOf("run"),
    });
  });

  it("infers argument types from literals, parameters, and local variables", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      class Demo {
        void run(String parameter) {
          int local = 1;
          select(parameter);
          select(local);
          select("literal");
        }
        void select(String value) {}
        void select(int value) {}
      }
    `);

    expect(
      facts.invocations
        .filter((invocation) => invocation.memberName === "select")
        .map((invocation) => invocation.argumentTypes),
    ).toEqual([["String"], ["int"], ["String"]]);
  });

  it("infers receiver types from try resources and catch parameters", async () => {
    const facts = await indexJava(`
      package com.example.demo;
      import java.io.IOException;
      import java.io.InputStream;
      class Demo {
        void run() {
          try (InputStream inputStream = open()) {
            inputStream.read();
          } catch (IOException error) {
            error.printStackTrace();
          }
        }
        InputStream open() { return null; }
      }
    `);

    expect(
      facts.invocations
        .filter((invocation) =>
          invocation.memberName === "read" ||
          invocation.memberName === "printStackTrace"
        )
        .map(({ memberName, receiverType }) => ({ memberName, receiverType })),
    ).toEqual([
      { memberName: "read", receiverType: "InputStream" },
      { memberName: "printStackTrace", receiverType: "IOException" },
    ]);
  });
});
