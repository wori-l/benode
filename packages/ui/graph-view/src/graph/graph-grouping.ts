import type {
  EndpointGraph,
  GraphNode,
} from "@benode/core";

export interface GraphGroup {
  readonly id: string;
  readonly ownerSymbolId: string | null;
  readonly name: string;
  readonly qualifiedName: string;
  readonly namespaceName: string;
  readonly role: string;
  readonly filterIds: readonly string[];
  readonly methods: readonly GraphNode[];
  readonly terminalNode?: GraphNode;
  readonly isRoot: boolean;
}

export interface GroupedEndpointGraph {
  readonly graph: EndpointGraph;
  readonly groups: readonly GraphGroup[];
  readonly nodeToGroupId: ReadonlyMap<string, string>;
}

function isTypeNode(node: GraphNode): boolean {
  return node.groupNode;
}

function ownerQualifiedName(node: GraphNode): string {
  const separator = node.symbol.qualifiedName.indexOf("#");
  return separator < 0
    ? node.symbol.qualifiedName
    : node.symbol.qualifiedName.slice(0, separator);
}

function simpleName(qualifiedName: string): string {
  const segment = qualifiedName.split(".").at(-1) ?? qualifiedName;
  return segment.split("$").at(-1) ?? segment;
}

function inferredNamespaceName(qualifiedName: string): string {
  const separator = qualifiedName.lastIndexOf(".");
  return separator < 0 ? "unknown" : qualifiedName.slice(0, separator);
}

function nodeNamespaceName(node: GraphNode, qualifiedName: string): string {
  const value = node.metadata["namespaceName"];
  if (value === null || value === "") {
    return "unknown";
  }
  return typeof value === "string" ? value : inferredNamespaceName(qualifiedName);
}

function ownerSymbolId(node: GraphNode): string | null {
  const value = node.metadata["ownerSymbolId"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function groupIdentity(node: GraphNode): {
  readonly id: string;
  readonly ownerSymbolId: string | null;
  readonly qualifiedName: string;
  readonly name: string;
  readonly namespaceName: string;
} {
  if (isTypeNode(node)) {
    const qualifiedName = ownerQualifiedName(node);
    return {
      id: "benode:group:" + encodeURIComponent(node.id),
      ownerSymbolId: node.id,
      qualifiedName,
      name: node.symbol.name,
      namespaceName: nodeNamespaceName(node, qualifiedName),
    };
  }

  const ownerId = ownerSymbolId(node);
  const qualifiedName = ownerQualifiedName(node);
  const fallbackId = qualifiedName.length > 0 ? qualifiedName : node.id;
  return {
    id: "benode:group:" + encodeURIComponent(ownerId ?? fallbackId),
    ownerSymbolId: ownerId,
    qualifiedName,
    name: simpleName(qualifiedName) || node.symbol.name,
    namespaceName: nodeNamespaceName(node, qualifiedName),
  };
}

export function groupEndpointGraph(
  graph: EndpointGraph,
  rootNodeId: string,
): GroupedEndpointGraph {
  const groups = new Map<string, {
    identity: ReturnType<typeof groupIdentity>;
    role: string;
    methods: GraphNode[];
    terminalNode?: GraphNode;
  }>();

  for (const node of graph.nodes) {
    const identity = groupIdentity(node);
    const group = groups.get(identity.id) ?? {
      identity,
      role: node.role,
      methods: [],
    };
    if (isTypeNode(node)) {
      group.terminalNode = node;
    } else {
      group.methods.push(node);
    }
    groups.set(identity.id, group);
  }

  const resultGroups = [...groups.values()]
    .filter((group) => group.methods.length > 0)
    .map((group): GraphGroup => ({
      id: group.identity.id,
      ownerSymbolId: group.identity.ownerSymbolId,
      name: group.identity.name,
      qualifiedName: group.identity.qualifiedName,
      namespaceName: group.identity.namespaceName,
      role: group.role,
      filterIds: [...new Set([
        ...group.methods,
        ...(group.terminalNode === undefined ? [] : [group.terminalNode]),
      ].flatMap((node) => node.filterIds))],
      methods: group.methods,
      terminalNode: group.terminalNode,
      isRoot: group.methods.some((node) => node.id === rootNodeId) ||
        group.terminalNode?.id === rootNodeId,
    }))
    .sort((left, right) =>
      left.qualifiedName.localeCompare(right.qualifiedName) ||
      left.id.localeCompare(right.id));

  const nodeToGroupId = new Map<string, string>();
  for (const group of resultGroups) {
    group.methods.forEach((method) => nodeToGroupId.set(method.id, group.id));
    if (group.terminalNode !== undefined) {
      nodeToGroupId.set(group.terminalNode.id, group.id);
    }
  }
  const visibleNodeIds = new Set(nodeToGroupId.keys());
  return {
    graph: visibleNodeIds.size === graph.nodes.length
      ? graph
      : {
          ...graph,
          nodes: graph.nodes.filter((node) => visibleNodeIds.has(node.id)),
          edges: graph.edges.filter(
            (edge) =>
              visibleNodeIds.has(edge.sourceNodeId) &&
              visibleNodeIds.has(edge.targetNodeId),
          ),
        },
    groups: resultGroups,
    nodeToGroupId,
  };
}
