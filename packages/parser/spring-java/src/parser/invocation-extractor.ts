import type {
  IndexedSymbol,
  InvocationFact,
} from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import { inferArgumentType } from "./argument-type-inference.js";
import {
  directChildOfType,
  nearestAncestor,
  nearestTypeDeclaration,
  nonNullNodes,
  normalizeType,
} from "./node-utils.js";
import { findTypeOwner } from "./symbol-helpers.js";
import type { SourceLocator } from "./source-locator.js";
import type { JavaExtractionInput } from "./types.js";

function invocationOwner(
  node: Node,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
  callableSymbols: ReadonlyMap<number, IndexedSymbol>,
): IndexedSymbol | null {
  const callableNode = nearestAncestor(
    node,
    (candidate) =>
      candidate.type === "constructor_declaration" ||
      candidate.type === "method_declaration",
  );
  return callableNode === null
    ? findTypeOwner(node, typeSymbols)
    : (callableSymbols.get(callableNode.id) ?? null);
}

function invocationOrder(
  left: InvocationFact,
  right: InvocationFact,
): number {
  return (
    left.sourceLocation.start.line - right.sourceLocation.start.line ||
    left.sourceLocation.start.column -
      right.sourceLocation.start.column ||
    left.expression.localeCompare(right.expression)
  );
}

interface ReceiverType {
  readonly type: string | null;
  readonly memberPath: readonly string[];
  readonly rootExpression: string;
}

function superConstructorType(
  node: Node,
): string {
  const typeDeclaration = nearestTypeDeclaration(node);
  const superclass = typeDeclaration === null
    ? null
    : directChildOfType(typeDeclaration, "superclass");
  const declaredSuperType = superclass === null
    ? null
    : (nonNullNodes(superclass.namedChildren)[0] ?? null);
  return normalizeType(declaredSuperType) ?? "Object";
}

function inferReceiverType(
  node: Node,
  owner: IndexedSymbol,
  symbols: readonly IndexedSymbol[],
): ReceiverType {
  const memberPath: string[] = [];
  let root = node;

  while (root.type === "field_access") {
    const object = root.childForFieldName("object");
    const field = root.childForFieldName("field");
    if (object === null || field === null) {
      break;
    }
    memberPath.unshift(field.text);
    root = object;
  }

  const type = inferArgumentType(root, owner, symbols);
  return {
    type: type ?? inferArgumentType(node, owner, symbols),
    memberPath,
    rootExpression: root.text,
  };
}

export function extractInvocations(
  input: JavaExtractionInput,
  locator: SourceLocator,
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
  callableSymbols: ReadonlyMap<number, IndexedSymbol>,
  symbols: readonly IndexedSymbol[],
): readonly InvocationFact[] {
  const invocations: InvocationFact[] = [];

  for (const capture of input.invocationsQuery.captures(input.rootNode)) {
    const node = capture.node;
    const owner = invocationOwner(
      node,
      typeSymbols,
      callableSymbols,
    );
    const argumentsNode = node.childForFieldName("arguments");
    if (owner === null || argumentsNode === null) {
      continue;
    }

    const isConstructor = capture.name === "constructor";
    const isSuperConstructor =
      node.childForFieldName("constructor")?.type === "super";
    const receiverNode = isConstructor
      ? null
      : node.childForFieldName("object");
    const memberNode = isConstructor && !isSuperConstructor
      ? node.childForFieldName("type")
      : node.childForFieldName("name");
    const memberName = isSuperConstructor
      ? superConstructorType(node)
      : normalizeType(memberNode);
    if (memberName === null) {
      continue;
    }

    const argumentsList = nonNullNodes(argumentsNode.namedChildren);
    const receiver = receiverNode === null
      ? { type: null, memberPath: [], rootExpression: "" }
      : inferReceiverType(receiverNode, owner, symbols);
    invocations.push({
      enclosingSymbolId: owner.id,
      kind: isConstructor ? "constructor" : "method",
      expression: node.text,
      memberName,
      receiverExpression: receiverNode?.text ?? null,
      receiverType: receiver.type,
      ...(receiver.memberPath.length === 0
        ? {}
        : {
            receiverMemberPath: receiver.memberPath,
            receiverRootExpression: receiver.rootExpression,
          }),
      argumentCount: argumentsList.length,
      argumentExpressions: argumentsList.map((argument) => argument.text),
      argumentTypes: argumentsList.map((argument) =>
        inferArgumentType(argument, owner, symbols),
      ),
      sourceLocation: locator.locationFor(node),
    });
  }

  return invocations.sort(invocationOrder);
}
