import {
  parseHostToWebviewMessage,
  type GraphNodeFilter,
  type ShowEndpointGraphMessage,
} from "@benode/core";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { WebviewBridge } from "../platform/bridge.js";
import { projectGraphFocus, type GraphFocusTarget } from "../graph/graph-focus.js";
import {
  groupEndpointGraph,
  type GroupedEndpointGraph,
} from "../graph/graph-grouping.js";
import { layoutEndpointGraph } from "../layout/graph-layout.js";
import type { LayoutResult } from "../layout/graph-layout-types.js";
import { decorateEdges, decorateNodes } from "../graph/graph-presentation.js";
import { projectEndpointGraph } from "../graph/graph-visibility.js";

export const FLOW_ID = "benode-endpoint-graph";

export interface GraphWorkspaceProps {
  readonly bridge: WebviewBridge;
  readonly initialMessage?: ShowEndpointGraphMessage;
}

export function useGraphWorkspace(props: GraphWorkspaceProps) {
  const message = ref<ShowEndpointGraphMessage>();
  const groupedGraph = ref<GroupedEndpointGraph>();
  const layout = ref<LayoutResult>();
  const loading = ref(true);
  const loadingMessage = ref("Waiting for endpoint graph…");
  const error = ref<string>();
  const selectedFilterIds = ref<ReadonlySet<string>>(new Set());
  const filterCounts = ref<ReadonlyMap<string, number>>(new Map());
  const focusTarget = ref<GraphFocusTarget>();
  let unsubscribe: (() => void) | undefined;
  let filterDefinitionKey = "";
  let layoutSequence = 0;

  const focusProjection = computed(() =>
    groupedGraph.value === undefined
      ? undefined
      : projectGraphFocus(groupedGraph.value, focusTarget.value));
  const flowNodes = computed(() =>
    decorateNodes(layout.value, focusProjection.value));
  const flowEdges = computed(() =>
    decorateEdges(layout.value, focusProjection.value));
  const nodeFilters = computed(() => message.value?.graph.nodeFilters ?? []);
  const filterSections = computed(() => {
    const sections: Array<{
      readonly label: string;
      readonly filters: GraphNodeFilter[];
    }> = [];
    for (const filter of nodeFilters.value) {
      const section = sections.find((item) => item.label === filter.section);
      if (section === undefined) {
        sections.push({ label: filter.section, filters: [filter] });
      } else {
        section.filters.push(filter);
      }
    }
    return sections;
  });
  const selectedGroupFilterCount = computed(() =>
    nodeFilters.value.filter(
      (filter) =>
        filter.target === "group" && selectedFilterIds.value.has(filter.id),
    ).length);
  const groupFilterCount = computed(() =>
    nodeFilters.value.filter((filter) => filter.target === "group").length);

  async function computeLayout(
    grouped: GroupedEndpointGraph,
    rootNodeId: string,
  ): Promise<LayoutResult | undefined> {
    // ELK calls may overlap when filters or host messages change quickly.
    // Only the newest request may publish state.
    const currentSequence = ++layoutSequence;
    loading.value = true;
    loadingMessage.value = layout.value === undefined
      ? "Arranging endpoint graph…"
      : "Updating graph…";
    error.value = undefined;
    try {
      const result = await layoutEndpointGraph(grouped, rootNodeId);
      return currentSequence === layoutSequence ? result : undefined;
    } catch (layoutError: unknown) {
      if (currentSequence === layoutSequence) {
        error.value = layoutError instanceof Error
          ? layoutError.message
          : "Unable to lay out the endpoint graph.";
      }
      return undefined;
    } finally {
      if (currentSequence === layoutSequence) {
        loading.value = false;
      }
    }
  }

  function synchronizeFilters(filters: readonly GraphNodeFilter[]): void {
    const definitionKey = JSON.stringify(filters.map((filter) => [
      filter.id,
      filter.defaultSelected,
    ]));
    if (definitionKey === filterDefinitionKey) {
      return;
    }
    filterDefinitionKey = definitionKey;
    selectedFilterIds.value = new Set(
      filters.filter((filter) => filter.defaultSelected).map(
        (filter) => filter.id,
      ),
    );
  }

  async function renderGraph(currentMessage: ShowEndpointGraphMessage): Promise<void> {
    synchronizeFilters(currentMessage.graph.nodeFilters);
    const projection = projectEndpointGraph(
      currentMessage.graph,
      currentMessage.endpoint.handlerSymbolId,
      selectedFilterIds.value,
    );
    const grouped = groupEndpointGraph(
      projection.graph,
      currentMessage.endpoint.handlerSymbolId,
    );
    const nextLayout = await computeLayout(
      grouped,
      currentMessage.endpoint.handlerSymbolId,
    );
    if (nextLayout === undefined) {
      return;
    }

    filterCounts.value = projection.filterCounts;
    groupedGraph.value = grouped;
    if (projectGraphFocus(grouped, focusTarget.value) === undefined) {
      focusTarget.value = undefined;
    }
    message.value = currentMessage;
    layout.value = nextLayout;
  }

  async function showGraph(value: unknown): Promise<void> {
    const parsed = parseHostToWebviewMessage(value);
    if (parsed === null) {
      layoutSequence += 1;
      error.value = "The extension sent an incompatible graph payload.";
      loading.value = false;
      return;
    }

    if (parsed.type === "endpointGraphLoading") {
      layoutSequence += 1;
      error.value = undefined;
      loading.value = true;
      loadingMessage.value = parsed.message;
      return;
    }

    if (parsed.type === "endpointGraphError") {
      layoutSequence += 1;
      error.value = parsed.message;
      loading.value = false;
      return;
    }

    error.value = undefined;
    await renderGraph(parsed);
  }

  function refreshGraph(): void {
    if (message.value !== undefined) {
      void renderGraph(message.value);
    }
  }

  function setFilterVisible(filterId: string, visible: boolean): void {
    const nextFilters = new Set(selectedFilterIds.value);
    if (visible) {
      nextFilters.add(filterId);
    } else {
      nextFilters.delete(filterId);
    }
    selectedFilterIds.value = nextFilters;
    refreshGraph();
  }

  function filterCount(filterId: string): number {
    return filterCounts.value.get(filterId) ?? 0;
  }

  function focusGroup(id: string): void {
    focusTarget.value = { kind: "group", id };
  }

  function focusNode(id: string): void {
    focusTarget.value = { kind: "node", id };
  }

  function clearFocus(): void {
    focusTarget.value = undefined;
  }

  function navigate(nodeId: string): void {
    const node = message.value?.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (node?.sourceLocation === undefined) {
      return;
    }
    props.bridge.postMessage({
      type: "navigateToSource",
      nodeId,
    });
  }

  function isGroupSelected(groupId: string): boolean {
    const target = focusTarget.value;
    return target?.kind === "group" && target.id === groupId;
  }

  function isNodeSelected(nodeId: string): boolean {
    return focusTarget.value?.kind === "node" && focusTarget.value.id === nodeId;
  }

  function onWorkspaceKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      clearFocus();
    }
  }

  onMounted(() => {
    unsubscribe = props.bridge.subscribe((incoming) => void showGraph(incoming));
    if (props.initialMessage !== undefined) {
      void showGraph(props.initialMessage);
    }
    props.bridge.postMessage({ type: "ready" });
  });
  onBeforeUnmount(() => {
    layoutSequence += 1;
    unsubscribe?.();
  });

  return {
    clearFocus,
    error,
    filterCount,
    filterSections,
    flowEdges,
    flowNodes,
    focusGroup,
    focusNode,
    groupFilterCount,
    isGroupSelected,
    isNodeSelected,
    layout,
    loading,
    loadingMessage,
    message,
    navigate,
    onWorkspaceKeydown,
    selectedFilterIds,
    selectedGroupFilterCount,
    setFilterVisible,
  };
}
