import type {
  ImportFact,
  IndexedSymbol,
} from "@benode/core";

import { findLombokAnnotation } from "./lombok-method-extractor.js";
import { createSymbolId } from "./symbol-helpers.js";
import type { JavaExtractionInput } from "./types.js";

interface ParameterSpec {
  readonly name: string;
  readonly type: string;
  readonly sourceLocation: IndexedSymbol["sourceLocation"];
}

function callableKey(
  ownerId: string,
  kind: "constructor" | "method",
  name: string,
  arity: number,
): string {
  return [ownerId, kind, name, arity.toString()].join("#");
}

function existingCallableKeys(
  symbols: readonly IndexedSymbol[],
): Set<string> {
  const parameterCounts = new Map<string, number>();
  for (const symbol of symbols) {
    if (symbol.kind === "parameter" && symbol.ownerSymbolId !== null) {
      parameterCounts.set(
        symbol.ownerSymbolId,
        (parameterCounts.get(symbol.ownerSymbolId) ?? 0) + 1,
      );
    }
  }
  return new Set(symbols.flatMap((symbol) => {
    if (symbol.kind !== "constructor" && symbol.kind !== "method") {
      return [];
    }
    return [callableKey(
      symbol.ownerSymbolId ?? "",
      symbol.kind,
      symbol.kind === "constructor" ? "" : symbol.symbol.name,
      parameterCounts.get(symbol.id) ?? 0,
    )];
  }));
}

function createCallable(
  input: JavaExtractionInput,
  owner: IndexedSymbol,
  kind: "constructor" | "method",
  name: string,
  parameters: readonly ParameterSpec[],
  declaredType: string | null,
  modifiers: readonly string[],
  sourceLocation = owner.sourceLocation,
): readonly IndexedSymbol[] {
  const signature = kind === "constructor"
    ? owner.symbol.qualifiedName + "#constructor(" +
      parameters.map((parameter) => parameter.type).join(",") + ")"
    : owner.symbol.qualifiedName + "#method:" + name + "(" +
      parameters.map((parameter) => parameter.type).join(",") + "):" +
      (declaredType ?? "");
  const callable: IndexedSymbol = {
    id: createSymbolId(input, signature),
    kind,
    ownerSymbolId: owner.id,
    symbol: {
      name: kind === "constructor" ? owner.symbol.name : name,
      qualifiedName: owner.symbol.qualifiedName + "#" +
        (kind === "constructor" ? "<init>" : name),
      signature,
    },
    declaredType,
    modifiers,
    sourceLocation,
    annotations: [],
    metadata: {
      declarationKind: kind,
      generatedBy: "lombok",
      implicit: true,
      methodBehavior: kind === "constructor"
        ? "trivialConstructor"
        : "trivialBuilder",
    },
  };
  const parameterSymbols = parameters.map((parameter, index) => {
    const parameterSignature = signature + "#parameter:" + index.toString() +
      ":" + parameter.name + ":" + parameter.type;
    return {
      id: createSymbolId(input, parameterSignature),
      kind: "parameter",
      ownerSymbolId: callable.id,
      symbol: {
        name: parameter.name,
        qualifiedName: callable.symbol.qualifiedName + "#" + parameter.name,
        signature: parameterSignature,
      },
      declaredType: parameter.type,
      modifiers: [],
      sourceLocation: parameter.sourceLocation,
      annotations: [],
      metadata: { generatedBy: "lombok", implicit: true, index },
    } satisfies IndexedSymbol;
  });
  return [callable, ...parameterSymbols];
}

function addCallable(
  output: IndexedSymbol[],
  known: Set<string>,
  symbols: readonly IndexedSymbol[],
): void {
  const callable = symbols[0];
  if (
    callable === undefined ||
    (callable.kind !== "constructor" && callable.kind !== "method")
  ) {
    return;
  }
  const name = callable.kind === "constructor" ? "" : callable.symbol.name;
  const key = callableKey(
    callable.ownerSymbolId ?? "",
    callable.kind,
    name,
    symbols.length - 1,
  );
  if (!known.has(key)) {
    output.push(...symbols);
    known.add(key);
  }
}

function parametersFor(fields: readonly IndexedSymbol[]): ParameterSpec[] {
  return fields.flatMap((field) => field.declaredType === null
    ? []
    : [{
        name: field.symbol.name,
        type: field.declaredType,
        sourceLocation: field.sourceLocation,
      }]);
}

function createBuilderType(
  input: JavaExtractionInput,
  owner: IndexedSymbol,
): IndexedSymbol {
  const name = owner.symbol.name + "Builder";
  const qualifiedName = owner.symbol.qualifiedName + "." + name;
  const signature = "type:" + qualifiedName;
  return {
    id: createSymbolId(input, signature),
    kind: "type",
    ownerSymbolId: owner.id,
    symbol: { name, qualifiedName, signature },
    declaredType: null,
    modifiers: ["public", "static"],
    sourceLocation: owner.sourceLocation,
    annotations: [],
    metadata: {
      declarationKind: "class",
      superTypes: [],
      generatedBy: "lombok",
      implicit: true,
    },
  };
}

export function extractLombokGeneratedMembers(
  input: JavaExtractionInput,
  imports: readonly ImportFact[],
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
  fields: readonly IndexedSymbol[],
  callableSymbols: readonly IndexedSymbol[],
): readonly IndexedSymbol[] {
  const output: IndexedSymbol[] = [];
  const known = existingCallableKeys(callableSymbols);
  const allTypes = [...typeSymbols.values()];

  for (const owner of allTypes) {
    const ownerFields = fields.filter(
      (field) => field.ownerSymbolId === owner.id,
    );
    const instanceFields = ownerFields.filter(
      (field) => !field.modifiers.includes("static"),
    );
    const allArgs = findLombokAnnotation(
      owner,
      "lombok.AllArgsConstructor",
      imports,
    );
    const noArgs = findLombokAnnotation(
      owner,
      "lombok.NoArgsConstructor",
      imports,
    );
    const builder = findLombokAnnotation(owner, "lombok.Builder", imports);
    const hasExplicitConstructor = callableSymbols.some(
      (symbol) => symbol.kind === "constructor" && symbol.ownerSymbolId === owner.id,
    );

    if (noArgs !== undefined) {
      addCallable(output, known, createCallable(
        input, owner, "constructor", "", [], null, ["public"],
        noArgs.sourceLocation,
      ));
    }
    if (
      allArgs !== undefined ||
      (builder !== undefined && noArgs === undefined && !hasExplicitConstructor)
    ) {
      addCallable(output, known, createCallable(
        input,
        owner,
        "constructor",
        "",
        parametersFor(instanceFields),
        null,
        allArgs === undefined ? [] : ["public"],
        (allArgs ?? builder)?.sourceLocation,
      ));
    }

    const slf4j = findLombokAnnotation(
      owner,
      "lombok.extern.slf4j.Slf4j",
      imports,
    );
    if (
      slf4j !== undefined &&
      !ownerFields.some((field) => field.symbol.name === "log")
    ) {
      const signature = owner.symbol.qualifiedName +
        "#field:log:org.slf4j.Logger";
      output.push({
        id: createSymbolId(input, signature),
        kind: "field",
        ownerSymbolId: owner.id,
        symbol: {
          name: "log",
          qualifiedName: owner.symbol.qualifiedName + "#log",
          signature,
        },
        declaredType: "org.slf4j.Logger",
        modifiers: ["private", "static", "final"],
        sourceLocation: slf4j.sourceLocation,
        annotations: [],
        metadata: { generatedBy: "lombok", implicit: true },
      });
    }

    if (builder === undefined) {
      continue;
    }
    const builderName = owner.symbol.name + "Builder";
    const builderType = allTypes.find(
      (type) =>
        type.ownerSymbolId === owner.id && type.symbol.name === builderName,
    ) ?? createBuilderType(input, owner);
    if (!allTypes.includes(builderType)) {
      output.push(builderType);
    }
    addCallable(output, known, createCallable(
      input,
      owner,
      "method",
      "builder",
      [],
      builderType.symbol.qualifiedName,
      ["public", "static"],
      builder.sourceLocation,
    ));
    for (const field of instanceFields) {
      addCallable(output, known, createCallable(
        input,
        builderType,
        "method",
        field.symbol.name,
        parametersFor([field]),
        builderType.symbol.qualifiedName,
        ["public"],
        field.sourceLocation,
      ));
    }
    addCallable(output, known, createCallable(
      input,
      builderType,
      "method",
      "build",
      [],
      owner.symbol.qualifiedName,
      ["public"],
      builder.sourceLocation,
    ));
  }

  return output;
}
