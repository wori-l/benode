import type { Node } from "@vscode/tree-sitter-wasm";

import type { LowSignalMethodBehavior } from "./method-behavior.js";
import { directChildOfType, nonNullNodes } from "./node-utils.js";

function directFieldName(
  node: Node,
  fieldNames: ReadonlySet<string>,
  parameterName: string | null = null,
): string | null {
  if (node.type === "identifier") {
    return fieldNames.has(node.text) && node.text !== parameterName
      ? node.text
      : null;
  }
  if (node.type !== "field_access") {
    return null;
  }

  const object = node.childForFieldName("object");
  const field = node.childForFieldName("field");
  return object?.type === "this" &&
    field?.type === "identifier" &&
    fieldNames.has(field.text)
    ? field.text
    : null;
}

function returnedExpression(statement: Node): Node | null {
  if (statement.type !== "return_statement") {
    return null;
  }
  const expressions = nonNullNodes(statement.namedChildren);
  return expressions.length === 1 ? (expressions[0] ?? null) : null;
}

function assignedField(
  statement: Node,
  fieldNames: ReadonlySet<string>,
  parameterName: string,
): string | null {
  if (statement.type !== "expression_statement") {
    return null;
  }
  const assignment = directChildOfType(
    statement,
    "assignment_expression",
  );
  if (
    assignment === null ||
    !nonNullNodes(assignment.children).some(
      (child) => child.type === "=",
    )
  ) {
    return null;
  }

  const left = assignment.childForFieldName("left");
  const right = assignment.childForFieldName("right");
  if (
    left === null ||
    right?.type !== "identifier" ||
    right.text !== parameterName
  ) {
    return null;
  }
  return directFieldName(left, fieldNames, parameterName);
}

export function classifyLowSignalMethod(
  node: Node,
  parameterNodes: readonly Node[],
  fieldNames: ReadonlySet<string>,
): LowSignalMethodBehavior | null {
  const body = node.childForFieldName("body");
  if (body?.type !== "block") {
    return null;
  }
  const statements = nonNullNodes(body.namedChildren);

  if (parameterNodes.length === 0 && statements.length === 1) {
    const expression = returnedExpression(statements[0]);
    return expression !== null &&
      directFieldName(expression, fieldNames) !== null
      ? "trivialGetter"
      : null;
  }

  if (parameterNodes.length !== 1) {
    return null;
  }
  const parameterName = parameterNodes[0]?.childForFieldName("name")?.text;
  if (
    parameterName === undefined ||
    statements.length < 1 ||
    assignedField(statements[0], fieldNames, parameterName) === null
  ) {
    return null;
  }
  if (statements.length === 1) {
    return "trivialSetter";
  }
  if (statements.length !== 2) {
    return null;
  }

  return returnedExpression(statements[1])?.type === "this"
    ? "trivialFluentSetter"
    : null;
}

export function classifyLowSignalConstructor(
  node: Node,
  parameterNodes: readonly Node[],
  fieldNames: ReadonlySet<string>,
): LowSignalMethodBehavior | null {
  const body = node.childForFieldName("body");
  if (body?.type !== "constructor_body") {
    return null;
  }
  const parameterNames = parameterNodes
    .map((parameter) => parameter.childForFieldName("name")?.text)
    .filter((name): name is string => name !== undefined);
  const statements = nonNullNodes(body.namedChildren);
  return parameterNames.length === parameterNodes.length &&
    statements.every((statement) =>
      parameterNames.some(
        (parameter) =>
          assignedField(statement, fieldNames, parameter) !== null,
      ),
    )
    ? "trivialConstructor"
    : null;
}
