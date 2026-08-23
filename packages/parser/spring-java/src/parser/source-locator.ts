import type { SourceLocation } from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

export class SourceLocator {
  readonly #uri: string;

  constructor(uri: string) {
    this.#uri = uri;
  }

  locationFor(node: Node): SourceLocation {
    return {
      uri: this.#uri,
      start: {
        line: node.startPosition.row,
        column: node.startPosition.column,
      },
      end: {
        line: node.endPosition.row,
        column: node.endPosition.column,
      },
    };
  }
}
