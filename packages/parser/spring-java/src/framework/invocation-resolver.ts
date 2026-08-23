import {
  resolveSymbolInvocation,
  type InvocationFact,
} from "@benode/core";

import { selectImplementationTypes } from "./implementation-resolver.js";
import { qualifyJavaLangType } from "./java-lang-types.js";
import { selectBestOverloads } from "./overload-resolver.js";
import type {
  InvocationResolution,
  SymbolContext,
  SymbolIndex,
} from "./types.js";

function staticImportOwner(
  memberName: string,
  source: SymbolContext,
): string | null {
  const exact = source.facts.imports.filter(
    (item) =>
      item.isStatic &&
      !item.isWildcard &&
      item.qualifiedName.endsWith("." + memberName),
  );
  if (exact.length === 1) {
    return exact[0]?.qualifiedName.slice(0, -(memberName.length + 1)) ?? null;
  }
  const wildcard = source.facts.imports.filter(
    (item) => item.isStatic && item.isWildcard,
  );
  return wildcard.length === 1 ? wildcard[0]?.qualifiedName ?? null : null;
}

export function resolveInvocation(
  invocation: InvocationFact,
  source: SymbolContext,
  index: SymbolIndex,
): InvocationResolution {
  const resolution = resolveSymbolInvocation(invocation, source, index, {
    selectImplementationTypes,
    selectBestCandidates: selectBestOverloads,
    staticImportOwner,
  });
  const fallbackOwnerQualifiedName =
    resolution.fallbackOwnerQualifiedName === null
      ? null
      : qualifyJavaLangType(resolution.fallbackOwnerQualifiedName);
  return fallbackOwnerQualifiedName === resolution.fallbackOwnerQualifiedName
    ? resolution
    : { ...resolution, fallbackOwnerQualifiedName };
}
