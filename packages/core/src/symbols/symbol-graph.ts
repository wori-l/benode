import type {
  InvocationFact,
} from "../contracts/contracts.js";
import type {
  GraphEdge,
  GraphNode,
  JsonObject,
  ResolutionConfidence,
} from "../contracts/model.js";
import { addFallbackNode } from "./fallback-node.js";
import { ownerType } from "./symbol-lookup.js";
import type {
  InvocationResolution,
  SymbolContext,
  SymbolIndex,
} from "./types.js";

export interface EndpointRouteMetadata {
  readonly basePaths: readonly string[];
  readonly methodPaths: readonly string[];
}

export interface SymbolGraphOptions<Role extends string> {
  readonly defaultRole: Role;
  readonly endpointRoutes?: ReadonlyMap<string, EndpointRouteMetadata>;
  readonly resolveInvocation: (
    invocation: InvocationFact,
    source: SymbolContext,
    index: SymbolIndex<Role>,
  ) => InvocationResolution;
  readonly nodeMetadata?: (
    context: SymbolContext,
    index: SymbolIndex<Role>,
    role: Role,
  ) => JsonObject;
  readonly nodeFilterIds?: (node: GraphNode) => readonly string[];
  readonly fallback: {
    readonly ambiguousRole: Role;
    readonly externalRole: Role;
    readonly unresolvedRole: Role;
  };
}

export interface SymbolGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

function roleFor<Role extends string>(
  context: SymbolContext,
  index: SymbolIndex<Role>,
  defaultRole: Role,
): Role {
  const owner =
    context.symbol.kind === "type"
      ? context
      : ownerType(context, index.symbolsById);
  return owner === null
    ? defaultRole
    : (index.typesById.get(owner.symbol.id)?.role ?? defaultRole);
}

function parameterMetadata(
  context: SymbolContext,
  index: SymbolIndex,
): readonly JsonObject[] {
  return (index.parametersByOwner.get(context.symbol.id) ?? []).map(
    (parameter) => ({
      name: parameter.symbol.symbol.name,
      type: parameter.symbol.declaredType ?? "",
    }),
  );
}

function buildNodes<Role extends string>(
  index: SymbolIndex<Role>,
  options: SymbolGraphOptions<Role>,
): GraphNode[] {
  const endpointRoutes = options.endpointRoutes ?? new Map();
  return index.symbols
    .filter(
      (context) =>
        context.symbol.kind === "type" ||
        context.symbol.kind === "method" ||
        context.symbol.kind === "constructor",
    )
    .map((context) => {
      const role = roleFor(context, index, options.defaultRole);
      const owner = ownerType(context, index.symbolsById);
      const route = endpointRoutes.get(context.symbol.id);
      const declaredType =
        context.symbol.kind === "constructor"
          ? owner?.symbol.symbol.qualifiedName ?? null
          : context.symbol.declaredType;
      return {
        id: context.symbol.id,
        role,
        filterIds: [],
        groupNode: context.symbol.kind === "type",
        requiresSourceLocation: true,
        unresolved: false,
        symbol: context.symbol.symbol,
        sourceLocation: context.symbol.sourceLocation,
        metadata: {
          applicationId: context.facts.applicationId,
          declaredType,
          ownerSymbolId: context.symbol.ownerSymbolId,
          namespaceName: context.facts.namespaceName,
          symbolKind: context.symbol.kind,
          ...(context.symbol.metadata["implicit"] === true
            ? { implicit: true }
            : {}),
          ...(typeof context.symbol.metadata["generatedBy"] === "string"
            ? { generatedBy: context.symbol.metadata["generatedBy"] }
            : {}),
          parameters: parameterMetadata(context, index),
          ...(route === undefined
            ? {}
            : {
                endpointBasePaths: route.basePaths,
                endpointMethodPaths: route.methodPaths,
              }),
          ...options.nodeMetadata?.(context, index, role),
        },
      };
    });
}

function edgeId(
  sourceId: string,
  targetId: string,
  confidence: ResolutionConfidence,
): string {
  return (
    "benode:edge:" +
    [
      sourceId,
      targetId,
      confidence,
    ]
      .map(encodeURIComponent)
      .join(":")
  );
}

function buildEdges<Role extends string>(
  index: SymbolIndex<Role>,
  nodes: GraphNode[],
  options: SymbolGraphOptions<Role>,
): GraphEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = new Map<string, GraphEdge>();

  for (const invocation of index.invocations) {
    const source = index.symbolsById.get(invocation.enclosingSymbolId);
    if (source === undefined || !nodeIds.has(source.symbol.id)) {
      continue;
    }
    const resolution = options.resolveInvocation(invocation, source, index);
    const targets = resolution.candidates.map((candidate) => ({
      id: candidate.symbol.id,
      role: roleFor(candidate, index, options.defaultRole),
    }));
    const resolvedTargets =
      targets.length === 0
        ? [
            addFallbackNode(
              invocation,
              resolution,
              source,
              nodes,
              nodeIds,
              options.fallback,
            ),
          ]
        : targets;

    for (const target of resolvedTargets) {
      if (!nodeIds.has(target.id)) {
        continue;
      }
      const unresolved =
        target.role === options.fallback.unresolvedRole;
      const confidence =
        targets.length === 0
          ? unresolved
            ? "unresolved"
            : "inferred"
          : resolution.confidence;
      const id = edgeId(source.symbol.id, target.id, confidence);
      const evidence = {
        reason: resolution.reason,
        candidateCount:
          targets.length === 0 ? (unresolved ? 0 : 1) : targets.length,
        sourceLocation: invocation.sourceLocation,
      };
      const previous = edges.get(id);
      edges.set(id, previous === undefined
        ? {
            id,
            sourceNodeId: source.symbol.id,
            targetNodeId: target.id,
            confidence,
            occurrenceCount: 1,
            evidence: [evidence],
          }
        : {
            ...previous,
            occurrenceCount: previous.occurrenceCount + 1,
            evidence: [...previous.evidence, evidence],
          });
    }
  }
  return [...edges.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

export function buildSymbolGraph<Role extends string>(
  index: SymbolIndex<Role>,
  options: SymbolGraphOptions<Role>,
): SymbolGraph {
  const nodes = buildNodes(index, options);
  const edges = buildEdges(index, nodes, options);
  return {
    nodes: nodes
      .map((node) => ({
        ...node,
        filterIds: options.nodeFilterIds?.(node) ?? [],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges,
  };
}
