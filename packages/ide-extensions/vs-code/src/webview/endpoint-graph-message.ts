import {
  getEndpointGraph,
  type FrameworkIndex,
  type ShowEndpointGraphMessage,
} from "@benode/core";

import type { EndpointGraphPanel } from "./endpoint-graph-panel.js";

export function createEndpointGraphMessage(
  index: FrameworkIndex,
  endpointId: string,
): ShowEndpointGraphMessage | undefined {
  const endpoint = index.endpoints.find(
    (candidate) => candidate.id === endpointId,
  );
  if (endpoint === undefined) {
    return undefined;
  }

  const graph = getEndpointGraph({
    index,
    endpointId,
    nodeFilters: [],
    confidences: [],
  });
  return {
    type: "showEndpointGraph",
    endpoint,
    graph,
  };
}

export type EndpointGraphRefreshResult =
  | "endpointUnavailable"
  | "noPanel"
  | "updated";

export function refreshEndpointGraphPanel(
  panel: EndpointGraphPanel,
  index: FrameworkIndex,
): EndpointGraphRefreshResult {
  const endpointId = panel.currentEndpointId();
  if (endpointId === undefined) {
    return "noPanel";
  }
  const message = createEndpointGraphMessage(index, endpointId);
  if (message === undefined) {
    return "endpointUnavailable";
  }
  // update() intentionally does not reveal the panel, preserving editor
  // focus and the webview state associated with stable graph IDs.
  panel.update(message);
  return "updated";
}
