import type { InvocationFact } from "../contracts/contracts.js";
import type { ResolutionConfidence } from "../contracts/model.js";
import { constructorKey, variableKey } from "./symbol-keys.js";
import {
  findFields, findMethods, findTypeCandidates, ownerType, qualifiedTypeName,
} from "./symbol-lookup.js";
import type {
  ImplementationSelection, InvocationResolution, SymbolContext, SymbolIndex, TypeContext,
} from "./types.js";

export interface SymbolInvocationResolverOptions<Role extends string> {
  readonly selectImplementationTypes?: (
    injectionPoint: SymbolContext,
    declaredTypes: readonly TypeContext<Role>[],
    index: SymbolIndex<Role>,
  ) => ImplementationSelection<Role>;
  readonly selectBestCandidates?: (
    candidates: readonly SymbolContext[],
    argumentTypes: readonly (string | null)[],
    index: SymbolIndex<Role>,
  ) => readonly SymbolContext[];
  readonly staticImportOwner?: (
    memberName: string,
    source: SymbolContext,
  ) => string | null;
}

function atOrAfter(
  position: { readonly line: number; readonly column: number },
  reference: { readonly line: number; readonly column: number },
): boolean {
  return (
    position.line > reference.line ||
    (position.line === reference.line &&
      position.column >= reference.column)
  );
}

function nestedReturnType<Role extends string>(
  expression: string,
  invocation: InvocationFact,
  source: SymbolContext,
  index: SymbolIndex<Role>,
  resolve: (item: InvocationFact) => InvocationResolution,
): { readonly name: string; readonly context: SymbolContext } | null {
  const nested = (
    index.invocationsByOwner.get(source.symbol.id) ?? []
  ).find(
    (candidate) =>
      candidate !== invocation &&
      candidate.expression === expression &&
      candidate.enclosingSymbolId === invocation.enclosingSymbolId &&
      atOrAfter(
        candidate.sourceLocation.start,
        invocation.sourceLocation.start,
      ) &&
      atOrAfter(
        invocation.sourceLocation.end,
        candidate.sourceLocation.end,
      ),
  );
  if (nested === undefined || nested.kind !== "method") {
    return null;
  }
  const resolution = resolve(nested);
  const target = resolution.candidates.length === 1
    ? resolution.candidates[0]
    : undefined;
  const name = target?.symbol.declaredType;
  return target === undefined || name === null || name === undefined
    ? null
    : { name, context: target };
}

function confidenceFor(
  candidates: readonly SymbolContext[],
  uniqueConfidence: ResolutionConfidence,
): ResolutionConfidence {
  return candidates.length > 1
    ? "ambiguous"
    : candidates.length === 1
      ? uniqueConfidence
      : "unresolved";
}

interface InferredReceiverResolution<Role extends string> {
  readonly types: readonly TypeContext<Role>[];
  readonly fallbackOwnerQualifiedName: string | null;
}


function inferredReceiverType<Role extends string>(
  invocation: InvocationFact,
  source: SymbolContext,
  index: SymbolIndex<Role>,
  root: {
    readonly name: string;
    readonly context: SymbolContext;
  } | null = null,
): InferredReceiverResolution<Role> | null {
  const rootType = root?.name ?? invocation.receiverType;
  if (rootType == null) {
    return null;
  }

  let context = root?.context ?? source;
  let declaredType = rootType;
  let types = findTypeCandidates(declaredType, context, index);
  for (const memberName of invocation.receiverMemberPath ?? []) {
    const fields = findFields(types, memberName, index);
    const field = fields[0];
    if (fields.length !== 1 || field?.symbol.declaredType == null) {
      return null;
    }
    context = field;
    declaredType = field.symbol.declaredType;
    types = findTypeCandidates(declaredType, context, index);
  }

  return {
    types,
    fallbackOwnerQualifiedName: types.length === 0
      ? qualifiedTypeName(declaredType, context)
      : null,
  };
}

export function resolveSymbolInvocation<Role extends string>(
  invocation: InvocationFact,
  source: SymbolContext,
  index: SymbolIndex<Role>,
  options: SymbolInvocationResolverOptions<Role> = {},
): InvocationResolution {
  const resolve = (item: InvocationFact): InvocationResolution =>
    resolveSymbolInvocation(item, source, index, options);
  const argumentTypes = invocation.argumentTypes.map(
    (type, position) =>
      type ??
      nestedReturnType(
        invocation.argumentExpressions[position] ?? "",
        invocation,
        source,
        index,
        resolve,
      )?.name ??
      null,
  );
  const select = (
    candidates: readonly SymbolContext[],
  ): readonly SymbolContext[] =>
    options.selectBestCandidates?.(candidates, argumentTypes, index) ??
    candidates;

  if (invocation.kind === "constructor") {
    const targetTypes = findTypeCandidates(
      invocation.memberName,
      source,
      index,
    );
    const arityCandidates = targetTypes.flatMap(
      (type) =>
        index.constructorsByOwnerArity.get(
          constructorKey(type.symbol.id, invocation.argumentCount),
        ) ?? [],
    );
    const candidates = select(arityCandidates);
    return {
      candidates,
      confidence: confidenceFor(candidates, "exact"),
      reason: "constructor type, arity, and argument types",
      fallbackOwnerQualifiedName:
        targetTypes.length === 0
          ? qualifiedTypeName(invocation.memberName, source)
          : null,
    };
  }

  const enclosingType = ownerType(source, index.symbolsById);
  if (enclosingType === null) {
    return {
      candidates: [],
      confidence: "unresolved",
      reason: "invocation has no enclosing type",
      fallbackOwnerQualifiedName: null,
    };
  }

  const receiverExpression = invocation.receiverExpression;
  const receiver = receiverExpression?.replace(/^this\./u, "") ?? null;
  let receiverTypes: readonly TypeContext<Role>[] = [];
  let confidence: ResolutionConfidence = "unresolved";
  let reason = "receiver declaration was not found";
  let fallbackOwnerQualifiedName: string | null = null;

  if (receiver === null || receiver === "this") {
    const ownType = index.typesById.get(enclosingType.symbol.id);
    receiverTypes = ownType === undefined ? [] : [ownType];
    confidence = "exact";
    reason = "same type method and arity";
    fallbackOwnerQualifiedName =
      options.staticImportOwner?.(invocation.memberName, source) ?? null;
  } else if (!/^[A-Za-z_$][\w$]*$/u.test(receiver)) {
    const returned = nestedReturnType(
      invocation.receiverRootExpression ??
        receiverExpression ??
        receiver,
      invocation,
      source,
      index,
      resolve,
    );
    const inferred = inferredReceiverType(
      invocation,
      source,
      index,
      returned,
    );
    if (inferred === null) {
      reason = "receiver expression type is unknown";
    } else {
      receiverTypes = inferred.types;
      confidence = "inferred";
      reason = returned === null
        ? "receiver inferred type"
        : "nested invocation return type";
      if (invocation.receiverMemberPath !== undefined) {
        reason += "; member declared type";
      }
      fallbackOwnerQualifiedName =
        inferred.fallbackOwnerQualifiedName;
    }
  } else {
    const scopedVariable = index.variablesByScopeName.get(
      variableKey(source.symbol.id, receiver),
    );
    const ownType = index.typesById.get(enclosingType.symbol.id);
    const inheritedFields = ownType === undefined
      ? []
      : findFields([ownType], receiver, index);
    const variable = scopedVariable ?? (
      inheritedFields.length === 1 ? inheritedFields[0] : undefined
    );
    if (variable?.symbol.declaredType != null) {
      const declaredTypes = findTypeCandidates(
        variable.symbol.declaredType,
        source,
        index,
      );
      const selection = options.selectImplementationTypes?.(
        variable,
        declaredTypes,
        index,
      ) ?? { types: declaredTypes, reason: null };
      receiverTypes = selection.types;
      confidence = "inferred";
      reason =
        (variable.symbol.kind === "field"
          ? "field declared type"
          : "parameter declared type") +
        (selection.reason === null ? "" : "; " + selection.reason);
      fallbackOwnerQualifiedName = declaredTypes.length === 0
        ? qualifiedTypeName(variable.symbol.declaredType, source)
        : null;
    } else if (invocation.receiverType != null) {
      receiverTypes = findTypeCandidates(
        invocation.receiverType,
        source,
        index,
      );
      confidence = "inferred";
      reason = "receiver inferred type";
      fallbackOwnerQualifiedName = receiverTypes.length === 0
        ? qualifiedTypeName(invocation.receiverType, source)
        : null;
    } else if (/^[A-Z]/u.test(receiver)) {
      receiverTypes = findTypeCandidates(receiver, source, index);
      confidence = "exact";
      reason = "static receiver type and arity";
      fallbackOwnerQualifiedName = receiverTypes.length === 0
        ? qualifiedTypeName(receiver, source)
        : null;
    }
  }

  const arityCandidates = findMethods(
    receiverTypes,
    invocation.memberName,
    invocation.argumentCount,
    index,
  );
  const candidates = select(arityCandidates);
  return {
    candidates,
    confidence: confidenceFor(candidates, confidence),
    reason:
      reason +
      (candidates.length < arityCandidates.length
        ? "; overload selected by argument types"
        : ""),
    fallbackOwnerQualifiedName:
      candidates.length === 0 ? fallbackOwnerQualifiedName : null,
  };
}
