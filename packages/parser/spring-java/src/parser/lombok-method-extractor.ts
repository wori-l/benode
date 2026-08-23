import type {
  AnnotationFact,
  ImportFact,
  IndexedSymbol,
} from "@benode/core";

import { createSymbolId } from "./symbol-helpers.js";
import type { JavaExtractionInput } from "./types.js";

function findLombokAnnotation(
  symbol: IndexedSymbol,
  qualifiedName: string,
  imports: readonly ImportFact[],
): AnnotationFact | undefined {
  const simpleName = qualifiedName.slice(qualifiedName.lastIndexOf(".") + 1);
  return symbol.annotations.find((annotation) => {
    if (annotation.name === qualifiedName) {
      return true;
    }
    if (annotation.name !== simpleName) {
      return false;
    }
    const explicitImports = imports.filter(
      (importFact) =>
        !importFact.isStatic &&
        !importFact.isWildcard &&
        importFact.qualifiedName.endsWith("." + simpleName),
    );
    if (explicitImports.length > 0) {
      return explicitImports.some(
        (importFact) => importFact.qualifiedName === qualifiedName,
      );
    }
    return imports.some(
      (importFact) =>
        !importFact.isStatic &&
        importFact.isWildcard &&
        qualifiedName.startsWith(importFact.qualifiedName + "."),
    );
  });
}

function generatesMember(annotation: AnnotationFact | undefined): boolean {
  return annotation !== undefined && !annotation.arguments.some(
    (argument) => /(?:^|\.)NONE$/u.test(argument.expression.replace(/\s/gu, "")),
  );
}

function accessorStem(field: IndexedSymbol): string {
  const name = field.symbol.name;
  if (field.declaredType === "boolean" && /^is[A-Z]/u.test(name)) {
    return name.slice(2);
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function methodKey(
  ownerSymbolId: string | null,
  name: string,
  parameterCount: number,
): string {
  return [ownerSymbolId ?? "", name, parameterCount.toString()].join("#");
}

function existingMethodKeys(
  callableSymbols: readonly IndexedSymbol[],
): Set<string> {
  const parameterCounts = new Map<string, number>();
  for (const symbol of callableSymbols) {
    if (symbol.kind === "parameter" && symbol.ownerSymbolId !== null) {
      parameterCounts.set(
        symbol.ownerSymbolId,
        (parameterCounts.get(symbol.ownerSymbolId) ?? 0) + 1,
      );
    }
  }
  return new Set(
    callableSymbols
      .filter((symbol) => symbol.kind === "method")
      .map((method) => methodKey(
        method.ownerSymbolId,
        method.symbol.name,
        parameterCounts.get(method.id) ?? 0,
      )),
  );
}

function createMethod(
  input: JavaExtractionInput,
  owner: IndexedSymbol,
  field: IndexedSymbol,
  name: string,
  parameterTypes: readonly string[],
  declaredType: string,
  methodBehavior: "trivialGetter" | "trivialSetter",
): IndexedSymbol {
  const signature =
    owner.symbol.qualifiedName +
    "#method:" +
    name +
    "(" +
    parameterTypes.join(",") +
    "):" +
    declaredType;
  return {
    id: createSymbolId(input, signature),
    kind: "method",
    ownerSymbolId: owner.id,
    symbol: {
      name,
      qualifiedName: owner.symbol.qualifiedName + "#" + name,
      signature,
    },
    declaredType,
    modifiers: [
      "public",
      ...(field.modifiers.includes("static") ? ["static"] : []),
    ],
    sourceLocation: field.sourceLocation,
    annotations: [],
    metadata: {
      declarationKind: "method",
      generatedBy: "lombok",
      implicit: true,
      methodBehavior,
    },
  };
}

function createSetterParameter(
  input: JavaExtractionInput,
  method: IndexedSymbol,
  field: IndexedSymbol,
): IndexedSymbol {
  const declaredType = field.declaredType ?? "";
  const signature =
    method.symbol.signature +
    "#parameter:0:" +
    field.symbol.name +
    ":" +
    declaredType;
  return {
    id: createSymbolId(input, signature),
    kind: "parameter",
    ownerSymbolId: method.id,
    symbol: {
      name: field.symbol.name,
      qualifiedName: method.symbol.qualifiedName + "#" + field.symbol.name,
      signature,
    },
    declaredType,
    modifiers: [],
    sourceLocation: field.sourceLocation,
    annotations: [],
    metadata: { generatedBy: "lombok", implicit: true, index: 0 },
  };
}

export function extractLombokMethods(
  input: JavaExtractionInput,
  imports: readonly ImportFact[],
  typeSymbols: ReadonlyMap<number, IndexedSymbol>,
  fields: readonly IndexedSymbol[],
  callableSymbols: readonly IndexedSymbol[],
): readonly IndexedSymbol[] {
  const typesById = new Map(
    [...typeSymbols.values()].map((type) => [type.id, type]),
  );
  const knownMethods = existingMethodKeys(callableSymbols);
  const symbols: IndexedSymbol[] = [];

  for (const field of fields) {
    const owner = field.ownerSymbolId === null
      ? undefined
      : typesById.get(field.ownerSymbolId);
    if (owner === undefined || field.declaredType === null) {
      continue;
    }

    const isStatic = field.modifiers.includes("static");
    const isData = findLombokAnnotation(
      owner,
      "lombok.Data",
      imports,
    ) !== undefined;
    const isValue = findLombokAnnotation(
      owner,
      "lombok.Value",
      imports,
    ) !== undefined;
    const typeGetter = generatesMember(
      findLombokAnnotation(owner, "lombok.Getter", imports),
    );
    const typeSetter = generatesMember(
      findLombokAnnotation(owner, "lombok.Setter", imports),
    );
    const fieldGetter = findLombokAnnotation(field, "lombok.Getter", imports);
    const fieldSetter = findLombokAnnotation(field, "lombok.Setter", imports);
    const hasGetter = fieldGetter === undefined
      ? !isStatic && (typeGetter || isData || isValue)
      : generatesMember(fieldGetter);
    const hasSetter = !field.modifiers.includes("final") && !isValue && (
      fieldSetter === undefined
        ? !isStatic && (typeSetter || isData)
        : generatesMember(fieldSetter)
    );
    const stem = accessorStem(field);

    if (hasGetter) {
      const name = field.declaredType === "boolean"
        ? "is" + stem
        : "get" + stem;
      const key = methodKey(owner.id, name, 0);
      if (!knownMethods.has(key)) {
        symbols.push(createMethod(
          input,
          owner,
          field,
          name,
          [],
          field.declaredType,
          "trivialGetter",
        ));
        knownMethods.add(key);
      }
    }

    if (hasSetter) {
      const name = "set" + stem;
      const key = methodKey(owner.id, name, 1);
      if (!knownMethods.has(key)) {
        const method = createMethod(
          input,
          owner,
          field,
          name,
          [field.declaredType],
          "void",
          "trivialSetter",
        );
        symbols.push(method, createSetterParameter(input, method, field));
        knownMethods.add(key);
      }
    }
  }

  return symbols;
}
