import { memberKey, variableKey } from "./symbol-keys.js";
import { declaredSuperTypes } from "./type-metadata.js";
import type {
  SymbolContext,
  SymbolIndex,
  TypeContext,
} from "./types.js";

export function ownerType(
  context: SymbolContext,
  symbolsById: ReadonlyMap<string, SymbolContext>,
): SymbolContext | null {
  let current: SymbolContext | undefined = context;
  while (current !== undefined && current.symbol.kind !== "type") {
    const ownerId = current.symbol.ownerSymbolId;
    if (ownerId === null) {
      return null;
    }
    current = symbolsById.get(ownerId);
  }
  return current ?? null;
}

function plainTypeName(type: string): string {
  return type
    .replace(/<.*>/gu, "")
    .replace(/\[\]|\.\.\.$/gu, "")
    .trim();
}

export function qualifiedTypeName(
  typeName: string,
  context: SymbolContext,
): string {
  const normalized = plainTypeName(typeName);
  if (normalized.includes(".")) {
    return normalized;
  }
  return context.facts.imports.find(
    (item) =>
      !item.isStatic &&
      !item.isWildcard &&
      item.qualifiedName.endsWith("." + normalized),
  )?.qualifiedName ?? normalized;
}

function withinApplication<Role extends string>(
  candidates: readonly TypeContext<Role>[],
  applicationId: string,
): readonly TypeContext<Role>[] {
  return candidates.filter(
    (candidate) => candidate.facts.applicationId === applicationId,
  );
}

export function findTypeCandidates<Role extends string>(
  typeName: string,
  context: SymbolContext,
  index: SymbolIndex<Role>,
): readonly TypeContext<Role>[] {
  const normalized = plainTypeName(typeName);
  const local = (
    candidates: readonly TypeContext<Role>[],
  ): readonly TypeContext<Role>[] =>
    withinApplication(candidates, context.facts.applicationId);

  if (normalized.includes(".")) {
    const exact = local(
      index.typesByQualifiedName.get(normalized) ?? [],
    );
    if (exact.length > 0) {
      return exact;
    }
    const namespaceQualified = context.facts.namespaceName === null
      ? normalized
      : context.facts.namespaceName + "." + normalized;
    return local(
      index.typesByQualifiedName.get(namespaceQualified) ?? [],
    );
  }

  let enclosing = ownerType(context, index.symbolsById);
  while (enclosing !== null) {
    const nestedName =
      enclosing.symbol.symbol.qualifiedName + "." + normalized;
    const nested = local(
      index.typesByQualifiedName.get(nestedName) ?? [],
    );
    if (nested.length > 0) {
      return nested;
    }
    const ownerId = enclosing.symbol.ownerSymbolId;
    const parent = ownerId === null
      ? undefined
      : index.symbolsById.get(ownerId);
    enclosing = parent?.symbol.kind === "type" ? parent : null;
  }

  const imported = context.facts.imports.find(
    (item) =>
      !item.isStatic &&
      !item.isWildcard &&
      item.qualifiedName.endsWith("." + normalized),
  );
  if (imported !== undefined) {
    return local(
      index.typesByQualifiedName.get(imported.qualifiedName) ?? [],
    );
  }

  const sameNamespace = context.facts.namespaceName === null
    ? normalized
    : context.facts.namespaceName + "." + normalized;
  const namespaceCandidates = local(
    index.typesByQualifiedName.get(sameNamespace) ?? [],
  );
  return namespaceCandidates.length > 0
    ? namespaceCandidates
    : local(index.typesBySimpleName.get(normalized) ?? []);
}

function methodParameterKey(
  method: SymbolContext,
  index: SymbolIndex,
): string {
  return (index.parametersByOwner.get(method.symbol.id) ?? [])
    .map((parameter) => parameter.symbol.declaredType ?? "")
    .join("\u0000");
}

function findMethodsInHierarchy<Role extends string>(
  type: TypeContext<Role>,
  memberName: string,
  argumentCount: number,
  index: SymbolIndex<Role>,
  visited: Set<string>,
  signatures: Set<string>,
): readonly SymbolContext[] {
  if (visited.has(type.symbol.id)) {
    return [];
  }
  visited.add(type.symbol.id);

  const declared = index.methodsByOwnerNameArity.get(
    memberKey(type.symbol.id, memberName, argumentCount),
  ) ?? [];
  const methods = declared.filter((method) => {
    const signature = methodParameterKey(method, index);
    if (signatures.has(signature)) {
      return false;
    }
    signatures.add(signature);
    return true;
  });
  const inherited = declaredSuperTypes(type)
    .flatMap((name) => findTypeCandidates(name, type, index))
    .flatMap((parent) => findMethodsInHierarchy(
      parent,
      memberName,
      argumentCount,
      index,
      visited,
      signatures,
    ));
  return [...methods, ...inherited];
}

export function findMethods<Role extends string>(
  ownerTypes: readonly TypeContext<Role>[],
  memberName: string,
  argumentCount: number,
  index: SymbolIndex<Role>,
): readonly SymbolContext[] {
  const methods = ownerTypes.flatMap((type) => findMethodsInHierarchy(
    type,
    memberName,
    argumentCount,
    index,
    new Set(),
    new Set(),
  ));
  return [...new Map(
    methods.map((method) => [method.symbol.id, method]),
  ).values()];
}

function findFieldsInHierarchy<Role extends string>(
  type: TypeContext<Role>,
  memberName: string,
  index: SymbolIndex<Role>,
  visited: Set<string>,
): readonly SymbolContext[] {
  if (visited.has(type.symbol.id)) {
    return [];
  }
  visited.add(type.symbol.id);

  const declared = index.variablesByScopeName.get(
    variableKey(type.symbol.id, memberName),
  );
  if (declared?.symbol.kind === "field") {
    return [declared];
  }
  return declaredSuperTypes(type)
    .flatMap((name) => findTypeCandidates(name, type, index))
    .flatMap((parent) => findFieldsInHierarchy(
      parent,
      memberName,
      index,
      visited,
    ));
}

export function findFields<Role extends string>(
  ownerTypes: readonly TypeContext<Role>[],
  memberName: string,
  index: SymbolIndex<Role>,
): readonly SymbolContext[] {
  const fields = ownerTypes.flatMap((type) => findFieldsInHierarchy(
    type,
    memberName,
    index,
    new Set(),
  ));
  return [...new Map(
    fields.map((field) => [field.symbol.id, field]),
  ).values()];
}
