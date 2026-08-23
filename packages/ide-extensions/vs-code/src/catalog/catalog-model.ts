import type {
  ApplicationDescriptor,
  EndpointDescriptor,
  FrameworkIndex,
  GraphNode,
  SourceLocation,
} from "@benode/core";

export interface ApplicationCatalogNode {
  readonly kind: "application";
  readonly id: string;
  readonly label: string;
  readonly sourceLocation: SourceLocation;
  readonly controllers: readonly ControllerCatalogNode[];
}

export interface ControllerCatalogNode {
  readonly kind: "controller";
  readonly id: string;
  readonly applicationId: string;
  readonly label: string;
  readonly qualifiedName: string;
  readonly sourceLocation: SourceLocation;
  readonly endpoints: readonly EndpointCatalogNode[];
}

export interface EndpointCatalogNode {
  readonly kind: "endpoint";
  readonly id: string;
  readonly applicationId: string;
  readonly controllerId: string;
  readonly label: string;
  readonly handlerName: string;
  readonly sourceLocation: SourceLocation;
}

export type CatalogNode =
  | ApplicationCatalogNode
  | ControllerCatalogNode
  | EndpointCatalogNode;

function compareNodes(
  left: Pick<CatalogNode, "id" | "label">,
  right: Pick<CatalogNode, "id" | "label">,
): number {
  return left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id);
}

function fallbackControllerName(
  endpoint: EndpointDescriptor,
  handler: GraphNode | undefined,
): { readonly name: string; readonly qualifiedName: string } {
  const qualifiedName =
    handler?.symbol.qualifiedName.split("#")[0] ??
    endpoint.controllerSymbolId;
  return {
    name: qualifiedName.split(".").at(-1) ?? qualifiedName,
    qualifiedName,
  };
}

function createEndpointNode(
  endpoint: EndpointDescriptor,
  handler: GraphNode | undefined,
): EndpointCatalogNode {
  const methods =
    endpoint.httpMethods.length === 0
      ? "ANY"
      : endpoint.httpMethods.join("|");
  const paths =
    endpoint.paths.length === 0 ? "/" : endpoint.paths.join(", ");

  return {
    kind: "endpoint",
    id: endpoint.id,
    applicationId: endpoint.applicationId,
    controllerId: endpoint.controllerSymbolId,
    label: methods + " " + paths,
    handlerName: handler?.symbol.name ?? "handler",
    sourceLocation: endpoint.sourceLocation,
  };
}

function createControllerNode(
  applicationId: string,
  controllerId: string,
  endpoints: readonly EndpointDescriptor[],
  nodesById: ReadonlyMap<string, GraphNode>,
): ControllerCatalogNode {
  const firstEndpoint = endpoints[0];
  if (firstEndpoint === undefined) {
    throw new Error("Cannot create a controller without endpoints.");
  }

  const controller = nodesById.get(controllerId);
  const fallback = fallbackControllerName(
    firstEndpoint,
    nodesById.get(firstEndpoint.handlerSymbolId),
  );
  const endpointNodes = endpoints
    .map((endpoint) =>
      createEndpointNode(
        endpoint,
        nodesById.get(endpoint.handlerSymbolId),
      ),
    )
    .sort(compareNodes);

  return {
    kind: "controller",
    id: controllerId,
    applicationId,
    label: controller?.symbol.name ?? fallback.name,
    qualifiedName:
      controller?.symbol.qualifiedName ?? fallback.qualifiedName,
    sourceLocation:
      controller?.sourceLocation ??
      firstEndpoint.sourceLocation,
    endpoints: endpointNodes,
  };
}

function createApplicationNode(
  application: ApplicationDescriptor,
  endpoints: readonly EndpointDescriptor[],
  nodesById: ReadonlyMap<string, GraphNode>,
): ApplicationCatalogNode {
  const endpointsByController = new Map<
    string,
    EndpointDescriptor[]
  >();

  for (const endpoint of endpoints) {
    const group =
      endpointsByController.get(endpoint.controllerSymbolId) ?? [];
    group.push(endpoint);
    endpointsByController.set(endpoint.controllerSymbolId, group);
  }

  const controllers = [...endpointsByController.entries()]
    .map(([controllerId, controllerEndpoints]) =>
      createControllerNode(
        application.id,
        controllerId,
        controllerEndpoints,
        nodesById,
      ),
    )
    .sort(compareNodes);

  return {
    kind: "application",
    id: application.id,
    label: application.name,
    sourceLocation: application.sourceLocation,
    controllers,
  };
}

export function createCatalog(
  index: FrameworkIndex,
): readonly ApplicationCatalogNode[] {
  const nodesById = new Map(
    index.nodes.map((node) => [node.id, node]),
  );
  const endpointsByApplication = new Map<string, EndpointDescriptor[]>();
  for (const endpoint of index.endpoints) {
    const endpoints = endpointsByApplication.get(endpoint.applicationId) ?? [];
    endpoints.push(endpoint);
    endpointsByApplication.set(endpoint.applicationId, endpoints);
  }

  return index.applications
    .map((application) =>
      createApplicationNode(
        application,
        endpointsByApplication.get(application.id) ?? [],
        nodesById,
      ),
    )
    .sort(compareNodes);
}
