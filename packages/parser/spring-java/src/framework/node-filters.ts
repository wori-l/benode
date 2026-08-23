import type { GraphNode, GraphNodeFilter } from "@benode/core";

export const SPRING_JAVA_NODE_ROLES = [
  "ambiguous",
  "component",
  "controller",
  "entity",
  "external",
  "httpClient",
  "helper",
  "repository",
  "service",
  "unresolved",
] as const;

export type SpringJavaNodeRole =
  (typeof SPRING_JAVA_NODE_ROLES)[number];

const ROLE_FILTERS: readonly GraphNodeFilter[] = [
  { id: "controller", label: "Controller", section: "Classes", target: "group", defaultSelected: true },
  { id: "service", label: "Service", section: "Classes", target: "group", defaultSelected: true },
  { id: "repository", label: "Repository", section: "Classes", target: "group", defaultSelected: true },
  { id: "httpClient", label: "HTTP client", section: "Classes", target: "group", defaultSelected: true },
  { id: "component", label: "Component", section: "Classes", target: "group", defaultSelected: false },
  { id: "helper", label: "Helper", section: "Classes", target: "group", defaultSelected: false },
  { id: "entity", label: "Entity", section: "Classes", target: "group", defaultSelected: false },
  { id: "external", label: "External", section: "Classes", target: "group", defaultSelected: false },
  { id: "ambiguous", label: "Ambiguous", section: "Others", target: "group", defaultSelected: false },
  { id: "unresolved", label: "Unresolved", section: "Others", target: "group", defaultSelected: false },
];

export const SPRING_JAVA_NODE_FILTERS: readonly GraphNodeFilter[] = [
  ...ROLE_FILTERS,
  {
    id: "trivial",
    label: "Trivials",
    section: "Methods",
    target: "node",
    defaultSelected: false,
  },
];

export function springJavaNodeFilterIds(
  node: GraphNode,
): readonly string[] {
  return [
    node.role,
    ...(node.metadata["graphSignal"] === "low" ? ["trivial"] : []),
  ];
}
