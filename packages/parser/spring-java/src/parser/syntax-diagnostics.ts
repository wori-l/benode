import {
  type AnalysisDiagnostic,
} from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import { nonNullNodes } from "./node-utils.js";
import type { SourceLocator } from "./source-locator.js";

function createDiagnostic(
  node: Node,
  locator: SourceLocator,
): AnalysisDiagnostic {
  const missing = node.isMissing;
  return {
    code: "java.syntaxError",
    severity: "warning",
    message: missing
      ? "Java parser inserted a missing syntax node."
      : "Java parser encountered invalid syntax.",
    sourceLocation: locator.locationFor(node),
    details: {
      nodeType: node.type,
      recovery: missing ? "missing" : "error",
    },
  };
}

export function collectSyntaxDiagnostics(
  rootNode: Node,
  locator: SourceLocator,
): readonly AnalysisDiagnostic[] {
  const diagnostics: AnalysisDiagnostic[] = [];

  const visit = (node: Node): void => {
    if (node.isError || node.isMissing) {
      diagnostics.push(createDiagnostic(node, locator));
      return;
    }
    for (const child of nonNullNodes(node.children)) {
      visit(child);
    }
  };

  visit(rootNode);
  return diagnostics;
}
