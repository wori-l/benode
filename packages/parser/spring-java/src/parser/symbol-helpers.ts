import {
  createStableSymbolId,
  type IndexedSymbol,
} from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import { nearestTypeDeclaration } from "./node-utils.js";
import type { JavaExtractionInput } from "./types.js";

export function createSymbolId(
  input: JavaExtractionInput,
  signature: string,
): string {
  return createStableSymbolId({
    applicationId: input.applicationId,
    relativeUri: input.relativeUri,
    qualifiedSignature: signature,
  });
}

export function findTypeOwner(
  node: Node,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
): IndexedSymbol | null {
  const ownerNode = nearestTypeDeclaration(node);
  return ownerNode === null
    ? null
    : (typeSymbols.get(ownerNode.id) ?? null);
}

export function locationOrder(
  left: IndexedSymbol,
  right: IndexedSymbol,
): number {
  return (
    left.sourceLocation.start.line - right.sourceLocation.start.line ||
    left.sourceLocation.start.column -
      right.sourceLocation.start.column ||
    left.id.localeCompare(right.id)
  );
}
