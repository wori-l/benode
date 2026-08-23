import { uniqueSorted, type JsonObject } from "@benode/core";

import { annotationStringValues } from "../parser/annotation-values.js";
import { annotationQualifiedName } from "./annotations.js";
import { ENTITY_TABLES } from "./constants.js";
import { ownerType } from "./symbol-lookup.js";
import type { SymbolContext, SymbolIndex } from "./types.js";

function qualifiedTableNames(entity: SymbolContext): readonly string[] {
  const annotation = entity.symbol.annotations.find(
    (candidate) =>
      ENTITY_TABLES.has(annotationQualifiedName(candidate, entity)),
  );
  if (annotation === undefined) {
    return [];
  }

  const names = annotationStringValues(annotation, "name");
  const schemas = annotationStringValues(annotation, "schema");
  return uniqueSorted(
    schemas.length === 0
      ? names
      : schemas.flatMap(
          (schema) => names.map((name) => schema + "." + name),
        ),
  );
}

export function entityMetadata(
  context: SymbolContext,
  index: SymbolIndex,
): JsonObject {
  const entity = context.symbol.kind === "type"
    ? context
    : ownerType(context, index.symbolsById);
  if (entity === null) {
    return {};
  }

  const tables = qualifiedTableNames(entity);
  return tables.length === 0 ? {} : { entityTables: tables };
}
