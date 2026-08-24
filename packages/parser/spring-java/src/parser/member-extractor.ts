import type { ImportFact, IndexedSymbol } from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import {
  extractModifiers,
  nonNullNodes,
  normalizeType,
} from "./node-utils.js";
import { extractAnnotations } from "./source-facts.js";
import {
  createSymbolId,
  findTypeOwner,
} from "./symbol-helpers.js";
import {
  classifyLowSignalConstructor,
  classifyLowSignalMethod,
} from "./method-classifier.js";
import { extractLombokMethods } from "./lombok-method-extractor.js";
import {
  extractLombokGeneratedMembers,
} from "./lombok-generated-member-extractor.js";
import type { SourceLocator } from "./source-locator.js";
import type {
  CallableNode,
  JavaExtractionInput,
} from "./types.js";

function extractFields(
  nodes: readonly Node[],
  input: JavaExtractionInput,
  locator: SourceLocator,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
): IndexedSymbol[] {
  const symbols: IndexedSymbol[] = [];

  for (const node of nodes) {
    const owner = findTypeOwner(node, typeSymbols);
    const declaredType = normalizeType(
      node.childForFieldName("type"),
    );
    if (owner === null || declaredType === null) {
      continue;
    }

    const declarators = nonNullNodes(node.namedChildren).filter(
      (child) => child.type === "variable_declarator",
    );
    for (const declarator of declarators) {
      const nameNode = declarator.childForFieldName("name");
      if (nameNode === null) {
        continue;
      }
      const signature =
        owner.symbol.qualifiedName +
        "#field:" +
        nameNode.text +
        ":" +
        declaredType;
      symbols.push({
        id: createSymbolId(input, signature),
        kind: "field",
        ownerSymbolId: owner.id,
        symbol: {
          name: nameNode.text,
          qualifiedName:
            owner.symbol.qualifiedName + "#" + nameNode.text,
          signature,
        },
        declaredType,
        modifiers: extractModifiers(node),
        sourceLocation: locator.locationFor(nameNode),
        annotations: extractAnnotations(node, locator),
        metadata: { declarationKind: "field" },
      });
    }
  }

  return symbols;
}

interface CallableExtractionResult {
  readonly symbols: readonly IndexedSymbol[];
  readonly symbolsByNodeId: ReadonlyMap<number, IndexedSymbol>;
}

function extractCallables(
  callables: readonly CallableNode[],
  input: JavaExtractionInput,
  locator: SourceLocator,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
  fieldSymbols: readonly IndexedSymbol[],
): CallableExtractionResult {
  const symbols: IndexedSymbol[] = [];
  const symbolsByNodeId = new Map<number, IndexedSymbol>();

  for (const { kind, node } of [...callables].sort(
    (left, right) => left.node.startIndex - right.node.startIndex,
  )) {
    const owner = findTypeOwner(node, typeSymbols);
    const nameNode = node.childForFieldName("name");
    const parametersNode = node.childForFieldName("parameters");
    if (owner === null || nameNode === null || parametersNode === null) {
      continue;
    }

    const parameterNodes = nonNullNodes(
      parametersNode.namedChildren,
    ).filter(
      (parameter) =>
        parameter.type === "formal_parameter" ||
        parameter.type === "spread_parameter",
    );
    const parameterTypes = parameterNodes.map((parameter) => {
      const type =
        normalizeType(parameter.childForFieldName("type")) ?? "";
      return parameter.type === "spread_parameter"
        ? type + "..."
        : type;
    });
    const isConstructor = kind === "constructor";
    const fieldNames = new Set(
      fieldSymbols
        .filter((field) => field.ownerSymbolId === owner.id)
        .map((field) => field.symbol.name),
    );
    const methodBehavior = isConstructor
      ? classifyLowSignalConstructor(node, parameterNodes, fieldNames)
      : classifyLowSignalMethod(node, parameterNodes, fieldNames);
    const declaredType = isConstructor
      ? null
      : normalizeType(node.childForFieldName("type"));
    const signature = isConstructor
      ? owner.symbol.qualifiedName +
        "#constructor(" +
        parameterTypes.join(",") +
        ")"
      : owner.symbol.qualifiedName +
        "#method:" +
        nameNode.text +
        "(" +
        parameterTypes.join(",") +
        "):" +
        (declaredType ?? "");
    const callable: IndexedSymbol = {
      id: createSymbolId(input, signature),
      kind: isConstructor ? "constructor" : "method",
      ownerSymbolId: owner.id,
      symbol: {
        name: nameNode.text,
        qualifiedName:
          owner.symbol.qualifiedName +
          "#" +
          (isConstructor ? "<init>" : nameNode.text),
        signature,
      },
      declaredType,
      modifiers: extractModifiers(node),
      sourceLocation: locator.locationFor(nameNode),
      annotations: extractAnnotations(node, locator),
      metadata: {
        declarationKind: isConstructor ? "constructor" : "method",
        ...(methodBehavior === null ? {} : { methodBehavior }),
      },
    };
    symbols.push(callable);
    symbolsByNodeId.set(node.id, callable);
    symbols.push(
      ...extractParameters(
        parameterNodes,
        parameterTypes,
        signature,
        callable,
        input,
        locator,
      ),
    );
  }

  return { symbols, symbolsByNodeId };
}

function extractImplicitConstructors(
  input: JavaExtractionInput,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
  callableSymbols: readonly IndexedSymbol[],
): IndexedSymbol[] {
  const ownersWithConstructor = new Set(
    callableSymbols
      .filter((symbol) => symbol.kind === "constructor")
      .map((symbol) => symbol.ownerSymbolId),
  );

  return [...typeSymbols.values()]
    .filter(
      (type) =>
        type.metadata["declarationKind"] === "class" &&
        !ownersWithConstructor.has(type.id),
    )
    .map((type) => {
      const signature = type.symbol.qualifiedName + "#constructor()";
      return {
        id: createSymbolId(input, signature),
        kind: "constructor",
        ownerSymbolId: type.id,
        symbol: {
          name: type.symbol.name,
          qualifiedName: type.symbol.qualifiedName + "#<init>",
          signature,
        },
        declaredType: null,
        modifiers: [],
        sourceLocation: type.sourceLocation,
        annotations: [],
        metadata: {
          declarationKind: "constructor",
          methodBehavior: "trivialConstructor",
          implicit: true,
        },
      } satisfies IndexedSymbol;
    });
}

function extractParameters(
  nodes: readonly Node[],
  types: readonly string[],
  callableSignature: string,
  callable: IndexedSymbol,
  input: JavaExtractionInput,
  locator: SourceLocator,
): IndexedSymbol[] {
  const parameters: IndexedSymbol[] = [];

  nodes.forEach((node, index) => {
    const nameNode = node.childForFieldName("name");
    if (nameNode === null) {
      return;
    }
    const declaredType = types[index] ?? "";
    const signature =
      callableSignature +
      "#parameter:" +
      index.toString() +
      ":" +
      nameNode.text +
      ":" +
      declaredType;
    parameters.push({
      id: createSymbolId(input, signature),
      kind: "parameter",
      ownerSymbolId: callable.id,
      symbol: {
        name: nameNode.text,
        qualifiedName:
          callable.symbol.qualifiedName + "#" + nameNode.text,
        signature,
      },
      declaredType,
      modifiers: extractModifiers(node),
      sourceLocation: locator.locationFor(nameNode),
      annotations: extractAnnotations(node, locator),
      metadata: { index },
    });
  });

  return parameters;
}

export interface MemberExtractionResult {
  readonly symbols: readonly IndexedSymbol[];
  readonly callableSymbolsByNodeId: ReadonlyMap<number, IndexedSymbol>;
}

export function extractMembers(
  fieldNodes: readonly Node[],
  callableNodes: readonly CallableNode[],
  imports: readonly ImportFact[],
  input: JavaExtractionInput,
  locator: SourceLocator,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
): MemberExtractionResult {
  const fields = extractFields(
    fieldNodes,
    input,
    locator,
    typeSymbols,
  );
  const callables = extractCallables(
    callableNodes,
    input,
    locator,
    typeSymbols,
    fields,
  );
  const lombokGeneratedMembers = extractLombokGeneratedMembers(
    input,
    imports,
    typeSymbols,
    fields,
    callables.symbols,
  );
  const implicitConstructors = extractImplicitConstructors(
    input,
    typeSymbols,
    [...callables.symbols, ...lombokGeneratedMembers],
  );
  const lombokMethods = extractLombokMethods(
    input,
    imports,
    typeSymbols,
    fields,
    [...callables.symbols, ...lombokGeneratedMembers],
  );
  return {
    symbols: [
      ...fields,
      ...callables.symbols,
      ...lombokGeneratedMembers,
      ...implicitConstructors,
      ...lombokMethods,
    ],
    callableSymbolsByNodeId: callables.symbolsByNodeId,
  };
}
