import type { TypeContext } from "./types.js";

export function declaredSuperTypes(
  context: TypeContext,
): readonly string[] {
  const value = context.symbol.metadata.superTypes;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function typeDeclarationKind(
  context: TypeContext,
): string | null {
  const value = context.symbol.metadata.declarationKind;
  return typeof value === "string" ? value : null;
}
