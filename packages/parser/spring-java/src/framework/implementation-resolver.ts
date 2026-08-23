import type { AnnotationFact } from "@benode/core";

import { annotationQualifiedName } from "./annotations.js";
import { QUALIFIER, ROLE_ANNOTATIONS } from "./constants.js";
import { typeDeclarationKind } from "./type-metadata.js";
import type {
  SymbolContext,
  SymbolIndex,
  TypeContext,
} from "./types.js";

export interface ImplementationSelection {
  readonly types: readonly TypeContext[];
  readonly reason: string | null;
}

interface QualifierSelection {
  readonly present: boolean;
  readonly value: string | null;
}

function annotationStringValue(
  annotation: AnnotationFact,
): string | null {
  const argument = annotation.arguments.find(
    (candidate) =>
      candidate.name === null || candidate.name === "value",
  );
  if (argument === undefined) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(argument.expression);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function qualifierFor(context: SymbolContext): QualifierSelection {
  const annotation = context.symbol.annotations.find(
    (candidate) =>
      annotationQualifiedName(candidate, context) === QUALIFIER,
  );
  return {
    present: annotation !== undefined,
    value:
      annotation === undefined
        ? null
        : annotationStringValue(annotation),
  };
}

function defaultBeanName(typeName: string): string {
  if (
    typeName.length > 1 &&
    typeName[0] === typeName[0]?.toUpperCase() &&
    typeName[1] === typeName[1]?.toUpperCase()
  ) {
    return typeName;
  }
  return typeName.charAt(0).toLowerCase() + typeName.slice(1);
}

function beanNames(type: TypeContext): ReadonlySet<string> {
  const names = new Set<string>([
    defaultBeanName(type.symbol.symbol.name),
  ]);

  for (const annotation of type.symbol.annotations) {
    const qualifiedName = annotationQualifiedName(annotation, type);
    if (
      qualifiedName === QUALIFIER ||
      ROLE_ANNOTATIONS.has(qualifiedName)
    ) {
      const value = annotationStringValue(annotation);
      if (value !== null) {
        names.add(value);
      }
    }
  }
  return names;
}

export function selectImplementationTypes(
  injectionPoint: SymbolContext,
  declaredTypes: readonly TypeContext[],
  index: SymbolIndex,
): ImplementationSelection {
  const interfaceType = declaredTypes[0];
  if (
    interfaceType === undefined ||
    declaredTypes.length !== 1 ||
    typeDeclarationKind(interfaceType) !== "interface"
  ) {
    return { types: declaredTypes, reason: null };
  }

  const implementations =
    index.implementationsByTypeId.get(interfaceType.symbol.id) ?? [];
  const qualifier = qualifierFor(injectionPoint);
  if (qualifier.present) {
    const qualifierValue = qualifier.value;
    const matches =
      qualifierValue === null
        ? []
        : implementations.filter((candidate) =>
            beanNames(candidate).has(qualifierValue),
          );
    return matches.length === 1
      ? {
          types: matches,
          reason: "@Qualifier implementation",
        }
      : {
          types: declaredTypes,
          reason: "interface fallback after unresolved @Qualifier",
        };
  }

  return implementations.length === 1
    ? {
        types: implementations,
        reason: "single interface implementation",
      }
    : {
        types: declaredTypes,
        reason: "interface fallback without a unique implementation",
      };
}
