import {
  getRectOfNodes,
  type VueFlowStore,
} from "@vue-flow/core";

const VIEWPORT_TRANSITION_DURATION = 200;
const SEARCH_RESULT_ZOOM = 1;

export function useGraphViewport() {
  let flowInstance: VueFlowStore | undefined;

  function setFlowInstance(instance: VueFlowStore): void {
    flowInstance = instance;
  }

  function centerNode(nodeId: string, zoom: number): Promise<boolean> | undefined {
    const currentFlow = flowInstance;
    const node = currentFlow?.findNode(nodeId);
    if (currentFlow === undefined || node === undefined) {
      return undefined;
    }
    const width = node.dimensions.width ||
      (typeof node.width === "number" ? node.width : 0);
    const height = node.dimensions.height ||
      (typeof node.height === "number" ? node.height : 0);
    return currentFlow.setCenter(
      node.computedPosition.x + width / 2,
      node.computedPosition.y + height / 2,
      { zoom, duration: VIEWPORT_TRANSITION_DURATION },
    );
  }

  function centerSearchNode(nodeId: string): void {
    void centerNode(nodeId, SEARCH_RESULT_ZOOM);
  }

  function fitGraph(): void {
    const currentFlow = flowInstance;
    if (currentFlow === undefined) {
      return;
    }
    const topLevelNodes = currentFlow.getNodes.value.filter(
      (node) => node.parentNode === undefined,
    );
    if (topLevelNodes.length === 0) {
      return;
    }
    void currentFlow.fitBounds(getRectOfNodes(topLevelNodes), {
      padding: 0.1,
      duration: VIEWPORT_TRANSITION_DURATION,
    });
  }

  return {
    centerSearchNode,
    fitGraph,
    setFlowInstance,
  };
}
