import type { InvocationFact } from "../contracts/contracts.js";
import type { GraphNode } from "../contracts/model.js";
import { createStableSymbolId } from "../source/stable-id.js";
import type {
  InvocationResolution,
  SymbolContext,
} from "./types.js";

function ownerName(qualifiedName: string): string {
  const segment = qualifiedName.split(".").at(-1) ?? qualifiedName;
  return segment.split("$").at(-1) ?? segment;
}

function namespaceName(qualifiedName: string): string | null {
  const separator = qualifiedName.lastIndexOf(".");
  return separator < 0 ? null : qualifiedName.slice(0, separator);
}

export interface FallbackNodeOptions<Role extends string> {
  readonly ambiguousRole: Role;
  readonly externalRole: Role;
  readonly unresolvedRole: Role;
}

export function addFallbackNode<Role extends string>(
  invocation: InvocationFact,
  resolution: InvocationResolution,
  source: SymbolContext,
  nodes: GraphNode[],
  nodeIds: Set<string>,
  options: FallbackNodeOptions<Role>,
): { readonly id: string; readonly role: Role } {
  const unresolved = resolution.fallbackOwnerQualifiedName === null;
  const ownerQualifiedName =
    resolution.fallbackOwnerQualifiedName ?? "unknown#" + invocation.memberName;
  const ambiguous = !unresolved && namespaceName(ownerQualifiedName) === null;
  const role = unresolved
    ? options.unresolvedRole
    : ambiguous
      ? options.ambiguousRole
      : options.externalRole;
  const relativeUri = unresolved
    ? "<unresolved>"
    : ambiguous
      ? "<ambiguous>"
      : "<external>";
  const ownerId = createStableSymbolId({
    applicationId: source.facts.applicationId,
    relativeUri,
    qualifiedSignature: ownerQualifiedName,
  });

  if (!nodeIds.has(ownerId)) {
    nodes.push({
      id: ownerId,
      role,
      filterIds: [],
      groupNode: true,
      requiresSourceLocation: false,
      unresolved,
      symbol: {
        name: ownerName(ownerQualifiedName),
        qualifiedName: ownerQualifiedName,
        signature: ownerQualifiedName,
      },
      metadata: {
        applicationId: source.facts.applicationId,
        declaredType: null,
        ownerSymbolId: null,
        namespaceName: namespaceName(ownerQualifiedName),
        symbolKind: "type",
        parameters: [],
      },
    });
    nodeIds.add(ownerId);
  }

  const parameterTypes = invocation.argumentTypes.map(
    (type) => type ?? "unknown",
  );
  const isConstructor = invocation.kind === "constructor";
  const signature = isConstructor
    ? ownerQualifiedName +
      "#constructor(" +
      parameterTypes.join(",") +
      ")"
    : ownerQualifiedName +
      "#method:" +
      invocation.memberName +
      "(" +
      parameterTypes.join(",") +
      "):";
  const methodId = createStableSymbolId({
    applicationId: source.facts.applicationId,
    relativeUri,
    qualifiedSignature: signature,
  });
  if (!nodeIds.has(methodId)) {
    nodes.push({
      id: methodId,
      role,
      filterIds: [],
      groupNode: false,
      requiresSourceLocation: false,
      unresolved,
      symbol: {
        name: isConstructor
          ? ownerName(ownerQualifiedName)
          : invocation.memberName,
        qualifiedName:
          ownerQualifiedName +
          "#" +
          (isConstructor ? "<init>" : invocation.memberName),
        signature,
      },
      metadata: {
        applicationId: source.facts.applicationId,
        declaredType: isConstructor ? ownerQualifiedName : null,
        ownerSymbolId: ownerId,
        namespaceName: namespaceName(ownerQualifiedName),
        symbolKind: invocation.kind,
        parameters: parameterTypes.map((type, index) => ({
          name: "arg" + index.toString(),
          type,
        })),
      },
    });
    nodeIds.add(methodId);
  }

  return { id: methodId, role };
}
