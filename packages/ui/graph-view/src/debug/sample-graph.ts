import {
  type GraphNode,
  type GraphNodeFilter,
  type ShowEndpointGraphMessage,
  type SourceLocation,
} from "@benode/core";


const nodeFilters: readonly GraphNodeFilter[] = [
  { id: "controller", label: "Controller", section: "Classes", target: "group", defaultSelected: true },
  { id: "service", label: "Service", section: "Classes", target: "group", defaultSelected: true },
  { id: "repository", label: "Repository", section: "Classes", target: "group", defaultSelected: true },
  { id: "httpClient", label: "HTTP client", section: "Classes", target: "group", defaultSelected: true },
  { id: "component", label: "Component", section: "Classes", target: "group", defaultSelected: false },
  { id: "helper", label: "Helper", section: "Classes", target: "group", defaultSelected: false },
  { id: "entity", label: "Entity", section: "Classes", target: "group", defaultSelected: false },
  { id: "external", label: "External", section: "Classes", target: "group", defaultSelected: false },
  { id: "trivial", label: "Trivials", section: "Methods", target: "node", defaultSelected: false },
  { id: "ambiguous", label: "Ambiguous", section: "Others", target: "group", defaultSelected: false },
  { id: "unresolved", label: "Unresolved", section: "Others", target: "group", defaultSelected: false },
];
const sourceRoot = "file:///workspace/src/main/java/com/example/demo/";

function location(file: string, line: number): SourceLocation {
  return {
    uri: sourceRoot + file,
    start: { line, column: 2 },
    end: { line: line + 4, column: 3 },
  };
}

function node(
  id: string,
  name: string,
  owner: string,
  role: GraphNode["role"],
  sourceLocation?: SourceLocation,
  metadata: GraphNode["metadata"] = {},
): GraphNode {
  return {
    id,
    role,
    filterIds: [role],
    groupNode: false,
    requiresSourceLocation: sourceLocation !== undefined,
    unresolved: role === "unresolved",
    symbol: {
      name,
      qualifiedName: owner + "#" + name,
      signature: owner + "#" + name + "()",
    },
    sourceLocation,
    metadata,
  };
}

const controllerLocation = location("controller/DemoController.java", 16);

export const sampleGraphMessage: ShowEndpointGraphMessage = {
  type: "showEndpointGraph",
  endpoint: {
    id: "sample:get-demo",
    applicationId: "sample:demo",
    controllerSymbolId: "sample:controller",
    handlerSymbolId: "sample:getData",
    httpMethods: ["GET"],
    paths: ["/api/demo/{id}"],
    sourceLocation: controllerLocation,
  },
  graph: {
    applicationId: "sample:demo",
    endpointId: "sample:get-demo",
    nodeFilters,
    nodes: [
      node(
        "sample:getData",
        "getData",
        "com.example.demo.controller.DemoController",
        "controller",
        controllerLocation,
        {
          declaredType: "DemoData",
          parameters: [{ name: "id", type: "String" }],
          endpointBasePaths: ["/api/demo"],
          endpointMethodPaths: ["/{id}"],
        },
      ),
      node(
        "sample:loadData",
        "loadData",
        "com.example.demo.service.DemoService",
        "service",
        location("service/DemoService.java", 19),
        {
          declaredType: "DemoData",
          parameters: [{ name: "id", type: "String" }],
        },
      ),
      node(
        "sample:repository",
        "findById",
        "com.example.demo.repository.DemoRepository",
        "repository",
        location("repository/DemoRepository.java", 8),
        {
          declaredType: "Optional<DataEntity>",
          parameters: [{ name: "id", type: "String" }],
        },
      ),
      node(
        "sample:entity",
        "displayName",
        "com.example.demo.models.entities.DataEntity",
        "entity",
        location("models/entities/DataEntity.java", 48),
        {
          declaredType: "String",
          ownerSymbolId: "sample:entity-type",
          symbolKind: "method",
          entityTables: ["data_entity"],
        },
      ),
      node(
        "sample:client",
        "fetchMetadata",
        "com.example.demo.client.DemoClient",
        "httpClient",
        location("client/DemoClient.java", 11),
        {
          declaredType: "String",
          parameters: [{ name: "id", type: "String" }],
          httpClientUrls: ["http://localhost:3000"],
          httpClientHttpMethods: ["GET"],
          httpClientPaths: ["/metadata/{id}"],
        },
      ),
      node(
        "sample:unresolved",
        "normalizePayload",
        "unresolved",
        "unresolved",
      ),
    ],
    edges: [
      {
        id: "sample:controller-service",
        sourceNodeId: "sample:getData",
        targetNodeId: "sample:loadData",
        confidence: "exact",
        occurrenceCount: 1,
        evidence: [{ reason: "Injected service receiver", candidateCount: 1 }],
      },
      {
        id: "sample:service-repository",
        sourceNodeId: "sample:loadData",
        targetNodeId: "sample:repository",
        confidence: "exact",
        occurrenceCount: 2,
        evidence: [
          { reason: "Repository field type", candidateCount: 1 },
          { reason: "Repeated repository call", candidateCount: 1 },
        ],
      },
      {
        id: "sample:service-entity",
        sourceNodeId: "sample:loadData",
        targetNodeId: "sample:entity",
        confidence: "inferred",
        occurrenceCount: 1,
        evidence: [{ reason: "Entity method receiver", candidateCount: 1 }],
      },
      {
        id: "sample:service-client",
        sourceNodeId: "sample:loadData",
        targetNodeId: "sample:client",
        confidence: "exact",
        occurrenceCount: 1,
        evidence: [{ reason: "OpenHTTP client method", candidateCount: 1 }],
      },
      {
        id: "sample:service-unresolved",
        sourceNodeId: "sample:loadData",
        targetNodeId: "sample:unresolved",
        confidence: "unresolved",
        occurrenceCount: 1,
        evidence: [{ reason: "No local declaration found", candidateCount: 0 }],
      },
    ],
    diagnostics: [],
  },
};
