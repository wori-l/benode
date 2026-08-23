import type {
  Language,
  Parser,
  Query,
} from "@vscode/tree-sitter-wasm";

interface TreeSitterExports {
  readonly Parser: {
    new (): Parser;
    init(options: {
      locateFile: (file: string, folder: string) => string;
    }): Promise<void>;
  };
  readonly Language: {
    load(input: string | Uint8Array): Promise<Language>;
  };
  readonly Query: {
    new (language: Language, source: string): Query;
  };
}

export interface JavaParserResources {
  readonly runtimeWasmPath: string;
  readonly javaLanguageWasmPath: string;
  readonly declarationsQuery: string;
  readonly invocationsQuery: string;
}

export interface JavaParserRuntime {
  readonly parser: Parser;
  readonly declarationsQuery: Query;
  readonly invocationsQuery: Query;
}

// Tree-sitter initialization is process-global. Cache it here and reject a
// second asset path rather than silently coupling parsers to the wrong Wasm.
let runtimePromise: Promise<TreeSitterExports> | null = null;
let initializedRuntimePath: string | null = null;

async function initializeRuntime(
  runtimeWasmPath: string,
): Promise<TreeSitterExports> {
  if (
    initializedRuntimePath !== null &&
    initializedRuntimePath !== runtimeWasmPath
  ) {
    throw new Error(
      "Tree-sitter was already initialized with a different runtime Wasm path.",
    );
  }

  if (runtimePromise === null) {
    initializedRuntimePath = runtimeWasmPath;
    runtimePromise = import("@vscode/tree-sitter-wasm")
      .then((module) => {
        const runtime = (
          module as unknown as { readonly default: TreeSitterExports }
        ).default;

        return runtime.Parser.init({
          locateFile: () => runtimeWasmPath,
        }).then(() => runtime);
      })
      .catch((error: unknown) => {
        runtimePromise = null;
        initializedRuntimePath = null;
        throw error;
      });
  }

  return runtimePromise;
}

export async function createJavaParserRuntime(
  resources: JavaParserResources,
): Promise<JavaParserRuntime> {
  const runtime = await initializeRuntime(resources.runtimeWasmPath);
  const language: Language = await runtime.Language.load(
    resources.javaLanguageWasmPath,
  );
  const parser = new runtime.Parser();
  parser.setLanguage(language);

  let declarationsQuery: Query | undefined;
  try {
    declarationsQuery = new runtime.Query(
      language,
      resources.declarationsQuery,
    );
    return {
      parser,
      declarationsQuery,
      invocationsQuery: new runtime.Query(
        language,
        resources.invocationsQuery,
      ),
    };
  } catch (error: unknown) {
    declarationsQuery?.delete();
    parser.delete();
    throw error;
  }
}
