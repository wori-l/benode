import { findTypeCandidates } from "./symbol-lookup.js";
import { declaredSuperTypes } from "./type-metadata.js";
import type {
  SymbolContext,
  SymbolIndex,
} from "./types.js";

const PRIMITIVE_WIDENING: Readonly<Record<string, readonly string[]>> = {
  byte: ["short", "int", "long", "float", "double"],
  short: ["int", "long", "float", "double"],
  char: ["int", "long", "float", "double"],
  int: ["long", "float", "double"],
  long: ["float", "double"],
  float: ["double"],
  double: [],
  boolean: [],
};

const BOXED_TYPES: Readonly<Record<string, string>> = {
  boolean: "Boolean",
  byte: "Byte",
  char: "Character",
  short: "Short",
  int: "Integer",
  long: "Long",
  float: "Float",
  double: "Double",
};

const BOXED_PRIMITIVES = new Map(
  Object.entries(BOXED_TYPES).map(([primitive, boxed]) => [boxed, primitive]),
);

const STANDARD_SUPERTYPES: Readonly<Record<string, readonly string[]>> = {
  String: ["CharSequence", "Serializable", "Comparable", "Object"],
  Boolean: ["Serializable", "Comparable", "Object"],
  Byte: ["Number", "Serializable", "Comparable", "Object"],
  Short: ["Number", "Serializable", "Comparable", "Object"],
  Integer: ["Number", "Serializable", "Comparable", "Object"],
  Long: ["Number", "Serializable", "Comparable", "Object"],
  Float: ["Number", "Serializable", "Comparable", "Object"],
  Double: ["Number", "Serializable", "Comparable", "Object"],
  Character: ["Serializable", "Comparable", "Object"],
};

function erasedType(type: string): string {
  return type
    .replace(/<.*>/gu, "")
    .replace(/\.\.\.$/u, "[]")
    .replace(/^\?extends/u, "")
    .replace(/^\?super/u, "")
    .trim();
}

function simpleType(type: string): string {
  return erasedType(type).split(".").at(-1) ?? type;
}

function inheritanceDistance(
  argumentType: string,
  parameterType: string,
  context: SymbolContext,
  index: SymbolIndex,
  visited: Set<string>,
): number | null {
  const argumentCandidates = findTypeCandidates(
    argumentType,
    context,
    index,
  );
  for (const candidate of argumentCandidates) {
    if (visited.has(candidate.symbol.id)) {
      continue;
    }
    if (simpleType(candidate.symbol.symbol.qualifiedName) === parameterType) {
      return 0;
    }
    visited.add(candidate.symbol.id);
    for (const superType of declaredSuperTypes(candidate)) {
      if (simpleType(superType) === parameterType) {
        return 1;
      }
      const distance = inheritanceDistance(
        superType,
        parameterType,
        candidate,
        index,
        visited,
      );
      if (distance !== null) {
        return distance + 1;
      }
    }
  }
  return null;
}

function primitiveScore(argument: string, parameter: string): number | null {
  if (argument === parameter) {
    return 0;
  }
  const widening = PRIMITIVE_WIDENING[argument];
  const widenedIndex = widening?.indexOf(parameter) ?? -1;
  if (widenedIndex >= 0) {
    return widenedIndex + 1;
  }
  if (BOXED_TYPES[argument] === parameter) {
    return 10;
  }
  return null;
}

function conversionScore(
  argumentType: string | null,
  parameterType: string,
  candidate: SymbolContext,
  index: SymbolIndex,
): number | null {
  if (argumentType === null) {
    return 0;
  }

  const argument = simpleType(argumentType);
  const parameter = simpleType(parameterType);
  if (argument === "null") {
    return parameter in PRIMITIVE_WIDENING
      ? null
      : parameter === "Object"
        ? 30
        : 20;
  }
  if (argument === parameter) {
    return 0;
  }

  if (argument in PRIMITIVE_WIDENING) {
    return primitiveScore(argument, parameter);
  }

  const unboxed = BOXED_PRIMITIVES.get(argument);
  if (unboxed !== undefined && parameter in PRIMITIVE_WIDENING) {
    const score = primitiveScore(unboxed, parameter);
    return score === null ? null : score + 10;
  }

  const standardDistance =
    STANDARD_SUPERTYPES[argument]?.indexOf(parameter) ?? -1;
  if (standardDistance >= 0) {
    return standardDistance + 1;
  }
  if (parameter === "Object") {
    return 30;
  }

  const distance = inheritanceDistance(
    argumentType,
    parameter,
    candidate,
    index,
    new Set(),
  );
  return distance === null ? null : distance + 1;
}

function candidateScore(
  candidate: SymbolContext,
  argumentTypes: readonly (string | null)[],
  index: SymbolIndex,
): number | null {
  const parameters = index.parametersByOwner.get(candidate.symbol.id) ?? [];
  if (parameters.length !== argumentTypes.length) {
    return null;
  }

  let score = 0;
  // Lower totals represent more specific Java conversions. Rejecting one
  // incompatible parameter removes the entire overload from consideration;
  // unknown argument types stay neutral so partial analysis remains useful.
  for (const [position, parameter] of parameters.entries()) {
    const parameterType = parameter.symbol.declaredType;
    if (parameterType === null) {
      continue;
    }
    const conversion = conversionScore(
      argumentTypes[position] ?? null,
      parameterType,
      candidate,
      index,
    );
    if (conversion === null) {
      return null;
    }
    score += conversion;
  }
  return score;
}

export function selectBestOverloads(
  candidates: readonly SymbolContext[],
  argumentTypes: readonly (string | null)[],
  index: SymbolIndex,
): readonly SymbolContext[] {
  if (candidates.length < 2) {
    return candidates;
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: candidateScore(candidate, argumentTypes, index),
    }))
    .filter(
      (item): item is { candidate: SymbolContext; score: number } =>
        item.score !== null,
    );
  if (scored.length === 0) {
    return candidates;
  }

  const bestScore = Math.min(...scored.map((item) => item.score));
  return scored
    .filter((item) => item.score === bestScore)
    .map((item) => item.candidate);
}
