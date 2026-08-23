import type {
  FileFacts,
  FrameworkBuildRequest,
} from "../contracts/contracts.js";
import type { ApplicationDescriptor } from "../contracts/model.js";
import {
  constructorKey,
  memberKey,
  variableKey,
} from "./symbol-keys.js";
import { findTypeCandidates } from "./symbol-lookup.js";
import {
  declaredSuperTypes,
  typeDeclarationKind,
} from "./type-metadata.js";
import type {
  SymbolContext,
  SymbolIndex,
  TypeContext,
} from "./types.js";

export interface SymbolIndexOptions<Role extends string> {
  readonly typeRole: (context: SymbolContext) => Role;
  readonly belongsToApplication?: (
    facts: FileFacts,
    application: ApplicationDescriptor,
  ) => boolean;
}

function grouped<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function parametersByOwner(
  symbols: readonly SymbolContext[],
): ReadonlyMap<string, readonly SymbolContext[]> {
  const parameters = new Map<string, SymbolContext[]>();
  for (const context of symbols) {
    if (
      context.symbol.kind !== "parameter" ||
      context.symbol.ownerSymbolId === null
    ) {
      continue;
    }
    const owned = parameters.get(context.symbol.ownerSymbolId) ?? [];
    owned.push(context);
    parameters.set(context.symbol.ownerSymbolId, owned);
  }
  for (const owned of parameters.values()) {
    owned.sort(
      (left, right) =>
        Number(left.symbol.metadata.index) -
        Number(right.symbol.metadata.index),
    );
  }
  return parameters;
}

function variableIndex(
  symbols: readonly SymbolContext[],
): ReadonlyMap<string, SymbolContext> {
  const variables = new Map<string, SymbolContext>();
  for (const context of symbols) {
    if (
      (context.symbol.kind === "field" ||
        context.symbol.kind === "parameter") &&
      context.symbol.ownerSymbolId !== null
    ) {
      variables.set(
        variableKey(
          context.symbol.ownerSymbolId,
          context.symbol.symbol.name,
        ),
        context,
      );
    }
  }
  return variables;
}

function ancestorTypes<Role extends string>(
  context: TypeContext<Role>,
  index: SymbolIndex<Role>,
  visited: Set<string>,
): readonly TypeContext<Role>[] {
  if (visited.has(context.symbol.id)) {
    return [];
  }
  visited.add(context.symbol.id);
  const direct = declaredSuperTypes(context).flatMap((name) =>
    findTypeCandidates(name, context, index),
  );
  return [
    ...direct,
    ...direct.flatMap((parent) => ancestorTypes(parent, index, visited)),
  ];
}

function populateImplementations<Role extends string>(
  index: SymbolIndex<Role>,
  output: Map<string, TypeContext<Role>[]>,
): void {
  for (const candidate of index.types) {
    if (
      typeDeclarationKind(candidate) !== "class" ||
      candidate.symbol.modifiers.includes("abstract")
    ) {
      continue;
    }
    for (const target of ancestorTypes(candidate, index, new Set())) {
      const values = output.get(target.symbol.id) ?? [];
      if (!values.some((item) => item.symbol.id === candidate.symbol.id)) {
        values.push(candidate);
        output.set(target.symbol.id, values);
      }
    }
  }
}

export function createSymbolIndex<Role extends string>(
  request: FrameworkBuildRequest,
  options: SymbolIndexOptions<Role>,
): SymbolIndex<Role> {
  const applicationsById = new Map(
    request.applications.map((application) => [application.id, application]),
  );
  const fileFacts = request.fileFacts.filter((facts) => {
    const application = applicationsById.get(facts.applicationId);
    return (
      application !== undefined &&
      (options.belongsToApplication?.(facts, application) ?? true)
    );
  });
  const symbols: SymbolContext[] = fileFacts.flatMap((facts) =>
    facts.symbols.map((symbol) => ({ facts, symbol })),
  );
  const symbolsById = new Map(
    symbols.map((context) => [context.symbol.id, context]),
  );
  const types: TypeContext<Role>[] = symbols
    .filter((context) => context.symbol.kind === "type")
    .map((context) => ({ ...context, role: options.typeRole(context) }));
  const parameters = parametersByOwner(symbols);
  const methods = symbols.filter(
    (context) => context.symbol.kind === "method",
  );
  const constructors = symbols.filter(
    (context) => context.symbol.kind === "constructor",
  );
  const implementationsByTypeId =
    new Map<string, TypeContext<Role>[]>();
  const invocations = fileFacts.flatMap((facts) => facts.invocations);
  const index: SymbolIndex<Role> = {
    fileFacts,
    symbols,
    methods,
    invocations,
    invocationsByOwner: grouped(
      invocations,
      (invocation) => invocation.enclosingSymbolId,
    ),
    symbolsById,
    types,
    typesById: new Map(
      types.map((context) => [context.symbol.id, context]),
    ),
    typesByQualifiedName: grouped(
      types,
      (context) => context.symbol.symbol.qualifiedName,
    ),
    typesBySimpleName: grouped(
      types,
      (context) => context.symbol.symbol.name,
    ),
    parametersByOwner: parameters,
    methodsByOwnerNameArity: grouped(methods, (context) =>
      memberKey(
        context.symbol.ownerSymbolId ?? "",
        context.symbol.symbol.name,
        parameters.get(context.symbol.id)?.length ?? 0,
      ),
    ),
    constructorsByOwnerArity: grouped(constructors, (context) =>
      constructorKey(
        context.symbol.ownerSymbolId ?? "",
        parameters.get(context.symbol.id)?.length ?? 0,
      ),
    ),
    variablesByScopeName: variableIndex(symbols),
    implementationsByTypeId,
  };
  populateImplementations(index, implementationsByTypeId);
  return index;
}
