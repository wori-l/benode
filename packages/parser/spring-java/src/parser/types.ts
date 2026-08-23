import type { Node, Query } from "@vscode/tree-sitter-wasm";

export interface JavaExtractionInput {
  readonly applicationId: string;
  readonly uri: string;
  readonly relativeUri: string;
  readonly contentVersion: string;
  readonly rootNode: Node;
  readonly declarationsQuery: Query;
  readonly invocationsQuery: Query;
}

export interface CallableNode {
  readonly kind: "constructor" | "method";
  readonly node: Node;
}
