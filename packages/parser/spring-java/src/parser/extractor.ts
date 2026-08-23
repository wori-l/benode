import {
  type FileFacts,
} from "@benode/core";
import type { Node } from "@vscode/tree-sitter-wasm";

import { extractInvocations } from "./invocation-extractor.js";
import { extractMembers } from "./member-extractor.js";
import { parseImport, parsePackage } from "./source-facts.js";
import { SourceLocator } from "./source-locator.js";
import { locationOrder } from "./symbol-helpers.js";
import { collectSyntaxDiagnostics } from "./syntax-diagnostics.js";
import { extractTypes } from "./type-extractor.js";
import type {
  CallableNode,
  JavaExtractionInput,
} from "./types.js";

interface DeclarationNodes {
  readonly packageNode?: Node;
  readonly imports: readonly Node[];
  readonly types: readonly Node[];
  readonly fields: readonly Node[];
  readonly callables: readonly CallableNode[];
}

function declarationNodes(input: JavaExtractionInput): DeclarationNodes {
  let packageNode: Node | undefined;
  const imports: Node[] = [];
  const types: Node[] = [];
  const fields: Node[] = [];
  const callables: CallableNode[] = [];

  for (const capture of input.declarationsQuery.captures(input.rootNode)) {
    switch (capture.name) {
      case "package":
        packageNode ??= capture.node;
        break;
      case "import":
        imports.push(capture.node);
        break;
      case "type":
        types.push(capture.node);
        break;
      case "field":
        fields.push(capture.node);
        break;
      case "constructor":
      case "method":
        callables.push({ kind: capture.name, node: capture.node });
        break;
    }
  }

  return { packageNode, imports, types, fields, callables };
}

export function extractJavaFileFacts(
  input: JavaExtractionInput,
): FileFacts {
  const locator = new SourceLocator(input.uri);
  const declarations = declarationNodes(input);
  const namespaceName = declarations.packageNode === undefined
    ? null
    : parsePackage(declarations.packageNode);
  const imports = declarations.imports.map((node) =>
    parseImport(node, locator),
  );
  const types = extractTypes(
    declarations.types,
    namespaceName,
    input,
    locator,
  );
  const members = extractMembers(
    declarations.fields,
    declarations.callables,
    imports,
    input,
    locator,
    types.symbolsByNodeId,
  );
  const symbols = [...types.symbols, ...members.symbols];

  return {
    applicationId: input.applicationId,
    uri: input.uri,
    relativeUri: input.relativeUri,
    contentVersion: input.contentVersion,
    namespaceName,
    imports,
    symbols: [...symbols].sort(locationOrder),
    invocations: extractInvocations(
      input,
      locator,
      types.symbolsByNodeId,
      members.callableSymbolsByNodeId,
      symbols,
    ),
    diagnostics: collectSyntaxDiagnostics(input.rootNode, locator),
  };
}
