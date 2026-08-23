import type { IndexedSymbol } from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import {
  nearestAncestor,
  nonNullNodes,
  normalizeType,
} from "./node-utils.js";

const CALLABLE_DECLARATIONS = new Set([
  "constructor_declaration",
  "method_declaration",
]);

function literalType(node: Node): string | null {
  switch (node.type) {
    case "string_literal":
    case "text_block":
      return "String";
    case "character_literal":
      return "char";
    case "decimal_integer_literal":
    case "hex_integer_literal":
    case "octal_integer_literal":
    case "binary_integer_literal":
      return /[lL]$/u.test(node.text) ? "long" : "int";
    case "decimal_floating_point_literal":
    case "hex_floating_point_literal":
      return /[fF]$/u.test(node.text) ? "float" : "double";
    case "true":
    case "false":
      return "boolean";
    case "null_literal":
      return "null";
    default:
      return null;
  }
}

function localVariableType(node: Node, name: string): string | null {
  const callable = nearestAncestor(node, (candidate) =>
    CALLABLE_DECLARATIONS.has(candidate.type),
  );
  if (callable === null) {
    return null;
  }

  const declarations = nonNullNodes(
    callable.descendantsOfType([
      "local_variable_declaration",
      "enhanced_for_statement",
      "catch_formal_parameter",
    ]),
  )
    .filter((declaration) => declaration.startIndex < node.startIndex)
    .sort((left, right) => right.startIndex - left.startIndex);

  for (const declaration of declarations) {
    const type = normalizeType(declaration.childForFieldName("type"));
    if (type === null) {
      continue;
    }
    const declaredNames =
      declaration.type === "local_variable_declaration"
        ? nonNullNodes(declaration.namedChildren)
            .filter((child) => child.type === "variable_declarator")
            .map((child) => child.childForFieldName("name")?.text)
        : [declaration.childForFieldName("name")?.text];
    if (declaredNames.includes(name)) {
      return type;
    }
  }
  return null;
}

function symbolVariableType(
  name: string,
  owner: IndexedSymbol,
  symbols: readonly IndexedSymbol[],
): string | null {
  const parameter = symbols.find(
    (symbol) =>
      symbol.kind === "parameter" &&
      symbol.ownerSymbolId === owner.id &&
      symbol.symbol.name === name,
  );
  if (
    parameter?.declaredType !== null &&
    parameter?.declaredType !== undefined
  ) {
    return parameter.declaredType;
  }

  const typeOwnerId = owner.kind === "type" ? owner.id : owner.ownerSymbolId;
  const field = symbols.find(
    (symbol) =>
      symbol.kind === "field" &&
      symbol.ownerSymbolId === typeOwnerId &&
      symbol.symbol.name === name,
  );
  return field?.declaredType ?? null;
}

function namedValueType(
  node: Node,
  owner: IndexedSymbol,
  symbols: readonly IndexedSymbol[],
): string | null {
  const name =
    node.type === "identifier"
      ? node.text
      : node.childForFieldName("field")?.text;
  if (name === undefined) {
    return null;
  }
  return (
    localVariableType(node, name) ??
    symbolVariableType(name, owner, symbols)
  );
}

export function inferArgumentType(
  node: Node,
  owner: IndexedSymbol,
  symbols: readonly IndexedSymbol[],
): string | null {
  const literal = literalType(node);
  if (literal !== null) {
    return literal;
  }

  switch (node.type) {
    case "identifier":
    case "field_access":
      return namedValueType(node, owner, symbols);
    case "object_creation_expression":
    case "array_creation_expression":
      return normalizeType(node.childForFieldName("type"));
    case "cast_expression":
      return normalizeType(node.childForFieldName("type"));
    case "parenthesized_expression": {
      const expression = nonNullNodes(node.namedChildren)[0];
      return expression === undefined
        ? null
        : inferArgumentType(expression, owner, symbols);
    }
    case "unary_expression": {
      const operand = nonNullNodes(node.namedChildren).at(-1);
      return operand === undefined
        ? null
        : inferArgumentType(operand, owner, symbols);
    }
    default:
      return null;
  }
}
