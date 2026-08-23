import {
  type FileFacts,
  type IndexFileRequest,
  type LanguageAdapter,
} from "@benode/core";

import { extractJavaFileFacts } from "./parser/extractor.js";
import {
  createJavaParserRuntime,
  type JavaParserResources,
  type JavaParserRuntime,
} from "./runtime.js";

export class TreeSitterJavaAdapter implements LanguageAdapter {
  readonly #runtime: JavaParserRuntime;
  #disposed = false;

  private constructor(runtime: JavaParserRuntime) {
    this.#runtime = runtime;
  }

  static async create(
    resources: JavaParserResources,
  ): Promise<TreeSitterJavaAdapter> {
    return new TreeSitterJavaAdapter(
      await createJavaParserRuntime(resources),
    );
  }

  async indexFile(request: IndexFileRequest): Promise<FileFacts> {
    if (this.#disposed) {
      throw new Error("Cannot index a file with a disposed Java adapter.");
    }

    const previous = request.previousFacts;
    if (
      previous !== undefined &&
      previous.applicationId === request.applicationId &&
      previous.uri === request.uri &&
      previous.relativeUri === request.relativeUri &&
      previous.contentVersion === request.contentVersion
    ) {
      // FileFacts are immutable and JSON-safe, so returning the compatible
      // snapshot avoids both parsing and extraction without sharing AST state.
      return previous;
    }

    const tree = this.#runtime.parser.parse(request.content);
    if (tree === null) {
      return {
        applicationId: request.applicationId,
        uri: request.uri,
        relativeUri: request.relativeUri,
        contentVersion: request.contentVersion,
        namespaceName: null,
        imports: [],
        symbols: [],
        invocations: [],
        diagnostics: [
          {
            code: "java.parseFailed",
            severity: "error",
            message: "Tree-sitter did not return a syntax tree.",
            sourceLocation: {
              uri: request.uri,
              start: { line: 0, column: 0 },
              end: { line: 0, column: 0 },
            },
            details: {},
          },
        ],
      };
    }

    try {
      return extractJavaFileFacts({
        applicationId: request.applicationId,
        uri: request.uri,
        relativeUri: request.relativeUri,
        contentVersion: request.contentVersion,
        rootNode: tree.rootNode,
        declarationsQuery: this.#runtime.declarationsQuery,
        invocationsQuery: this.#runtime.invocationsQuery,
      });
    } finally {
      tree.delete();
      this.#runtime.parser.reset();
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#runtime.declarationsQuery.delete();
    this.#runtime.invocationsQuery.delete();
    this.#runtime.parser.delete();
    this.#disposed = true;
  }
}
