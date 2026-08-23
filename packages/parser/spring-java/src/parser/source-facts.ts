import type {
  AnnotationArgument,
  AnnotationFact,
  ImportFact,
} from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import type { SourceLocator } from "./source-locator.js";

import {
  directChildOfType,
  nonNullNodes,
} from "./node-utils.js";

function extractAnnotation(
  node: Node,
  locator: SourceLocator,
): AnnotationFact {
  const name = node.childForFieldName("name")?.text ?? "";
  const argumentList = node.childForFieldName("arguments");
  const args: AnnotationArgument[] = [];

  if (argumentList !== null) {
    for (const argument of nonNullNodes(argumentList.namedChildren)) {
      if (argument.type === "element_value_pair") {
        const key = argument.childForFieldName("key");
        const value = argument.childForFieldName("value");
        if (value !== null) {
          args.push({
            name: key?.text ?? null,
            expression: value.text,
            sourceLocation: locator.locationFor(value),
          });
        }
      } else {
        args.push({
          name: null,
          expression: argument.text,
          sourceLocation: locator.locationFor(argument),
        });
      }
    }
  }

  return {
    name,
    arguments: args,
    sourceLocation: locator.locationFor(node),
  };
}

export function extractAnnotations(
  node: Node,
  locator: SourceLocator,
): readonly AnnotationFact[] {
  const modifiers = directChildOfType(node, "modifiers");
  if (modifiers === null) {
    return [];
  }

  return nonNullNodes(modifiers.namedChildren)
    .filter(
      (child) =>
        child.type === "annotation" ||
        child.type === "marker_annotation",
    )
    .map((annotation) => extractAnnotation(annotation, locator));
}

export function parsePackage(node: Node): string | null {
  const match = /^package\s+(.+?)\s*;$/su.exec(node.text);
  return match?.[1] ?? null;
}

export function parseImport(
  node: Node,
  locator: SourceLocator,
): ImportFact {
  let imported = node.text
    .replace(/^import\s+/u, "")
    .replace(/;\s*$/u, "");
  const isStatic = imported.startsWith("static ");
  if (isStatic) {
    imported = imported.slice("static ".length);
  }

  const isWildcard = imported.endsWith(".*");
  if (isWildcard) {
    imported = imported.slice(0, -2);
  }

  return {
    qualifiedName: imported.trim(),
    isStatic,
    isWildcard,
    sourceLocation: locator.locationFor(node),
  };
}
