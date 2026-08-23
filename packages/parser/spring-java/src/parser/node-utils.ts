import type { Node } from "@vscode/tree-sitter-wasm";

const TYPE_DECLARATIONS = new Set([
  "annotation_type_declaration",
  "class_declaration",
  "enum_declaration",
  "interface_declaration",
  "record_declaration",
]);

const MODIFIER_TOKENS = new Set([
  "abstract",
  "default",
  "final",
  "native",
  "non-sealed",
  "private",
  "protected",
  "public",
  "sealed",
  "static",
  "strictfp",
  "synchronized",
  "transient",
  "volatile",
]);

export function nonNullNodes(
  nodes: readonly (Node | null)[],
): Node[] {
  return nodes.filter((node): node is Node => node !== null);
}

export function normalizeType(node: Node | null): string | null {
  return node === null ? null : node.text.replace(/\s+/gu, "");
}

export function directChildOfType(
  node: Node,
  type: string,
): Node | null {
  return (
    nonNullNodes(node.namedChildren).find(
      (child) => child.type === type,
    ) ?? null
  );
}

export function nearestAncestor(
  node: Node,
  predicate: (candidate: Node) => boolean,
): Node | null {
  let current = node.parent;
  while (current !== null) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export function nearestTypeDeclaration(node: Node): Node | null {
  return nearestAncestor(node, (candidate) =>
    TYPE_DECLARATIONS.has(candidate.type),
  );
}

export function extractModifiers(node: Node): readonly string[] {
  const modifiers = directChildOfType(node, "modifiers");
  if (modifiers === null) {
    return [];
  }

  return nonNullNodes(modifiers.children)
    .filter((child) => MODIFIER_TOKENS.has(child.type))
    .map((child) => child.text);
}
