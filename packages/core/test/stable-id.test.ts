import { describe, expect, it } from "vitest";

import {
  createStableApplicationId,
  createStableSymbolId,
  normalizeRelativeUri,
} from "../src/index.js";

describe("createStableApplicationId", () => {
  it("is deterministic and normalizes module paths", () => {
    const posixId = createStableApplicationId({
      moduleRelativeUri: "services/demo",
      entryPointQualifiedName: "com.example.DemoApplication",
    });
    const windowsId = createStableApplicationId({
      moduleRelativeUri: "services\\demo\\.",
      entryPointQualifiedName: "com.example.DemoApplication",
    });

    expect(posixId).toBe(windowsId);
    expect(posixId).toBe(
      "benode:application:services%2Fdemo:" +
        "com.example.DemoApplication",
    );
  });

  it("uses a stable marker for the workspace-root module", () => {
    expect(
      createStableApplicationId({
        moduleRelativeUri: ".",
        entryPointQualifiedName: "com.example.DemoApplication",
      }),
    ).toBe(
      "benode:application:.:com.example.DemoApplication",
    );
  });

  it("changes when the module or entry point changes", () => {
    const base = createStableApplicationId({
      moduleRelativeUri: ".",
      entryPointQualifiedName: "com.example.DemoApplication",
    });

    expect(
      createStableApplicationId({
        moduleRelativeUri: "other",
        entryPointQualifiedName: "com.example.DemoApplication",
      }),
    ).not.toBe(base);
    expect(
      createStableApplicationId({
        moduleRelativeUri: ".",
        entryPointQualifiedName: "com.example.OtherApplication",
      }),
    ).not.toBe(base);
  });
});

describe("createStableSymbolId", () => {
  const baseInput = {
    applicationId: "orders-app",
    relativeUri: "src/main/java/com/example/OrderController.java",
    qualifiedSignature: "com.example.OrderController#getOrder(java.lang.Long)",
  } as const;

  it("is deterministic for the same input", () => {
    expect(createStableSymbolId(baseInput)).toBe(
      createStableSymbolId(baseInput),
    );
  });

  it("normalizes Windows and POSIX relative paths", () => {
    const windowsId = createStableSymbolId({
      ...baseInput,
      relativeUri:
        "src\\main\\java\\com\\example\\.\\OrderController.java",
    });

    expect(windowsId).toBe(createStableSymbolId(baseInput));
  });

  it.each([
    ["applicationId", "billing-app"],
    ["relativeUri", "src/main/java/com/example/OtherController.java"],
    [
      "qualifiedSignature",
      "com.example.OrderController#getOrder(java.lang.String)",
    ],
  ] as const)("changes when %s changes", (property, value) => {
    expect(
      createStableSymbolId({ ...baseInput, [property]: value }),
    ).not.toBe(createStableSymbolId(baseInput));
  });

  it("encodes namespaced parts without runtime hashing", () => {
    expect(createStableSymbolId(baseInput)).toBe(
      "benode:symbol:orders-app:" +
        "src%2Fmain%2Fjava%2Fcom%2Fexample%2FOrderController.java:" +
        "com.example.OrderController%23getOrder(java.lang.Long)",
    );
  });
});

describe("normalizeRelativeUri", () => {
  it("collapses dot segments and preserves leading parent segments", () => {
    expect(normalizeRelativeUri("./src/main/../test/File.java")).toBe(
      "src/test/File.java",
    );
    expect(normalizeRelativeUri("../shared/File.java")).toBe(
      "../shared/File.java",
    );
  });
});
