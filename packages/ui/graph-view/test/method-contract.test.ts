import type { GraphNode } from "@benode/core";
import { describe, expect, it } from "vitest";

import {
  displayPath,
  metadataPaths,
  methodOutput,
  methodParameters,
} from "../src/contracts/method-contract.js";

function node(metadata: GraphNode["metadata"]): GraphNode {
  return {
    id: "method",
    role: "service",
    filterIds: [],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    symbol: {
      name: "run",
      qualifiedName: "example.Service#run",
      signature: "example.Service#run(String):Result",
    },
    metadata,
  };
}

describe("method contract", () => {
  it("reads ordered inputs, output and endpoint path metadata", () => {
    const method = node({
      parameters: [
        { name: "id", type: "String" },
        { name: "limit", type: "int" },
      ],
      declaredType: "Result",
      endpointBasePaths: ["/api"],
      endpointMethodPaths: ["/items/{id}"],
    });

    expect(methodParameters(method)).toEqual([
      { name: "id", type: "String" },
      { name: "limit", type: "int" },
    ]);
    expect(methodOutput(method)).toBe("Result");
    expect(metadataPaths(method, "endpointBasePaths")).toEqual(["/api"]);
    expect(metadataPaths(method, "endpointMethodPaths")).toEqual(["/items/{id}"]);
  });

  it("uses safe fallbacks for absent or malformed metadata", () => {
    const method = node({
      parameters: [{ name: "value" }, { type: "ignored" }, "invalid"],
      endpointBasePaths: ["/api", 42],
    });

    expect(methodParameters(method)).toEqual([{ name: "value", type: "unknown" }]);
    expect(methodOutput(method)).toBe("unknown");
    expect(metadataPaths(method, "endpointBasePaths")).toEqual(["/api"]);
    expect(displayPath("")).toBe("/");
  });
});
