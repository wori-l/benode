import type { IndexedSymbol } from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import {
  directChildOfType,
  extractModifiers,
  nearestTypeDeclaration,
  nonNullNodes,
  normalizeType,
} from "./node-utils.js";
import { extractAnnotations } from "./source-facts.js";
import type { SourceLocator } from "./source-locator.js";
import { createSymbolId } from "./symbol-helpers.js";
import type { JavaExtractionInput } from "./types.js";

export interface TypeExtractionResult {
  readonly symbols: readonly IndexedSymbol[];
  readonly symbolsByNodeId: ReadonlyMap<number, IndexedSymbol>;
}

function declarationKind(node: Node): string {
  return node.type.replace(/_declaration$/u, "");
}

function childTypes(node: Node | null): readonly string[] {
  if (node === null) {
    return [];
  }

  const typeList = directChildOfType(node, "type_list");
  const typeNodes = nonNullNodes(
    (typeList ?? node).namedChildren,
  );
  return typeNodes
    .map((typeNode) => normalizeType(typeNode))
    .filter((type): type is string => type !== null);
}

function superTypes(node: Node): readonly string[] {
  const superclass = directChildOfType(node, "superclass");
  const interfaces =
    directChildOfType(node, "super_interfaces") ??
    directChildOfType(node, "extends_interfaces");

  return [
    ...childTypes(superclass).slice(0, 1),
    ...childTypes(interfaces),
  ];
}

export function extractTypes(
  nodes: readonly Node[],
  namespaceName: string | null,
  input: JavaExtractionInput,
  locator: SourceLocator,
): TypeExtractionResult {
  const symbols: IndexedSymbol[] = [];
  const symbolsByNodeId = new Map<number, IndexedSymbol>();

  for (const node of [...nodes].sort(
    (left, right) => left.startIndex - right.startIndex,
  )) {
    const nameNode = node.childForFieldName("name");
    if (nameNode === null) {
      continue;
    }

    const ownerNode = nearestTypeDeclaration(node);
    const owner =
      ownerNode === null
        ? undefined
        : symbolsByNodeId.get(ownerNode.id);
    const qualifiedName =
      owner === undefined
        ? namespaceName === null
          ? nameNode.text
          : namespaceName + "." + nameNode.text
        : owner.symbol.qualifiedName + "." + nameNode.text;
    const signature = "type:" + qualifiedName;
    const symbol: IndexedSymbol = {
      id: createSymbolId(input, signature),
      kind: "type",
      ownerSymbolId: owner?.id ?? null,
      symbol: {
        name: nameNode.text,
        qualifiedName,
        signature,
      },
      declaredType: null,
      modifiers: extractModifiers(node),
      sourceLocation: locator.locationFor(nameNode),
      annotations: extractAnnotations(node, locator),
      metadata: {
        declarationKind: declarationKind(node),
        superTypes: superTypes(node),
      },
    };
    symbols.push(symbol);
    symbolsByNodeId.set(node.id, symbol);
  }

  return { symbols, symbolsByNodeId };
}
