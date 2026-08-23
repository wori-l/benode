import type { AnnotationFact } from "@benode/core";

import {
  ENTITY_TABLES,
  FIXED_MAPPING_METHODS,
  QUALIFIER,
  REQUEST_MAPPING,
  RESPONSE_BODY,
  ROLE_ANNOTATIONS,
} from "./constants.js";
import type { SpringJavaNodeRole } from "./node-filters.js";
import type { SymbolContext } from "./types.js";

function isSupportedAnnotation(qualifiedName: string): boolean {
  return (
    ROLE_ANNOTATIONS.has(qualifiedName) ||
    ENTITY_TABLES.has(qualifiedName) ||
    FIXED_MAPPING_METHODS.has(qualifiedName) ||
    qualifiedName === QUALIFIER ||
    qualifiedName === REQUEST_MAPPING ||
    qualifiedName === RESPONSE_BODY
  );
}

export function annotationQualifiedName(
  annotation: AnnotationFact,
  context: SymbolContext,
): string {
  if (annotation.name.includes(".")) {
    return annotation.name;
  }

  const explicitImport = context.facts.imports.find(
    (item) =>
      !item.isStatic &&
      !item.isWildcard &&
      item.qualifiedName.endsWith("." + annotation.name),
  );
  if (explicitImport !== undefined) {
    return explicitImport.qualifiedName;
  }

  for (const item of context.facts.imports) {
    if (!item.isStatic && item.isWildcard) {
      const candidate = item.qualifiedName + "." + annotation.name;
      if (isSupportedAnnotation(candidate)) {
        return candidate;
      }
    }
  }

  return context.facts.namespaceName === null
    ? annotation.name
    : context.facts.namespaceName + "." + annotation.name;
}

export function hasAnnotation(
  context: SymbolContext,
  qualifiedName: string,
): boolean {
  return context.symbol.annotations.some(
    (annotation) =>
      annotationQualifiedName(annotation, context) === qualifiedName,
  );
}

export function typeRole(context: SymbolContext): SpringJavaNodeRole {
  for (const annotation of context.symbol.annotations) {
    const role = ROLE_ANNOTATIONS.get(
      annotationQualifiedName(annotation, context),
    );
    if (role !== undefined) {
      return role;
    }
  }
  return "helper";
}
