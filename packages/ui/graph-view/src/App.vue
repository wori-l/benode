<script setup lang="ts">
import type {
  GraphNode,
  HttpMethod,
  ShowEndpointGraphMessage,
} from "@benode/core";
import { VueFlow } from "@vue-flow/core";
import { computed, ref } from "vue";

import type { WebviewBridge } from "./platform/bridge.js";
import BenodeRoutedEdge from "./components/BenodeRoutedEdge.vue";
import GraphGroupCard from "./components/GraphGroupCard.vue";
import GraphNodeCard from "./components/GraphNodeCard.vue";
import GraphSearchBar from "./components/GraphSearchBar.vue";
import { entityTables } from "./contracts/entity-contract.js";
import {
  httpClientHttpMethods,
  httpClientPaths,
  httpClientUrls,
} from "./contracts/http-client-contract.js";
import { metadataPaths } from "./contracts/method-contract.js";
import type { GraphNodeData, GroupNodeData } from "./layout/graph-layout-types.js";
import { useGraphSearch } from "./graph/graph-search.js";
import { useGraphViewport } from "./composables/use-graph-viewport.js";
import { FLOW_ID, useGraphWorkspace } from "./composables/use-graph-workspace.js";

const props = defineProps<{
  bridge: WebviewBridge;
  initialMessage?: ShowEndpointGraphMessage;
}>();
const nodeTypeFilter = ref<HTMLDetailsElement>();

const {
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
} = useGraphWorkspace(props);

const {
  centerSearchNode,
  fitGraph,
  setFlowInstance,
} = useGraphViewport();

const {
  clearSearch,
  moveSearch,
  searchMatches,
  searchPosition,
  searchQuery,
} = useGraphSearch({
  nodes: computed(() => layout.value?.nodes ?? []),
  centerNode: centerSearchNode,
});

function groupData(value: unknown): GroupNodeData {
  return value as GroupNodeData;
}

function graphNodeData(value: unknown): GraphNodeData {
  return value as GraphNodeData;
}

function endpointMethods(isRoot: boolean): readonly HttpMethod[] {
  return isRoot ? message.value?.endpoint.httpMethods ?? [] : [];
}

function rootNode(): GraphNode | undefined {
  const current = message.value;
  return current?.graph.nodes.find(
    (node) => node.id === current.endpoint.handlerSymbolId,
  );
}

function endpointBasePaths(isRoot: boolean): readonly string[] {
  return isRoot ? metadataPaths(rootNode(), "endpointBasePaths") : [];
}

function endpointMethodPaths(isRoot: boolean): readonly string[] {
  return isRoot ? metadataPaths(rootNode(), "endpointMethodPaths") : [];
}

function graphNodeMethods(
  node: GraphNode,
  isRoot: boolean,
): readonly HttpMethod[] {
  return isRoot ? endpointMethods(true) : httpClientHttpMethods(node);
}

function graphNodePaths(
  node: GraphNode,
  isRoot: boolean,
): readonly string[] {
  return isRoot ? endpointMethodPaths(true) : httpClientPaths(node);
}

function closeNodeTypeFilter(event: PointerEvent): void {
  const filter = nodeTypeFilter.value;
  if (filter?.open && !filter.contains(event.target as Node)) {
    filter.open = false;
  }
}
</script>

<template>
  <main class="app-shell" @pointerdown.capture="closeNodeTypeFilter" @keydown="onWorkspaceKeydown">
    <div v-if="loading && !layout" class="center-state" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p>{{ loadingMessage }}</p>
    </div>
    <div v-else-if="error && !layout" class="center-state error-state" role="alert">
      <span aria-hidden="true">!</span>
      <h2>Graph unavailable</h2>
      <p>{{ error }}</p>
    </div>
    <section
      v-else-if="message && layout"
      class="workspace"
      aria-label="Interactive endpoint graph"
    >
      <div v-if="error" class="graph-error-banner" role="alert">{{ error }}</div>
      <div v-else-if="loading" class="layout-progress" role="status">
        {{ loadingMessage }}
      </div>
      <div class="graph-toolbar">
        <button
          class="fit-graph-action"
          type="button"
          title="Fit graph to view"
          aria-label="Fit graph to view"
          :disabled="loading || flowNodes.length === 0"
          @click="fitGraph"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
        <GraphSearchBar
          v-model:query="searchQuery"
          :position="searchPosition"
          :result-count="searchMatches.length"
          @move="moveSearch"
          @clear="clearSearch"
        />
        <details ref="nodeTypeFilter" class="node-type-filter">
          <summary>
            Node groups
            <span class="filter-count">{{ selectedGroupFilterCount }}/{{ groupFilterCount }}</span>
          </summary>
          <fieldset>
            <legend>Visible graph nodes</legend>
            <template
              v-for="(section, sectionIndex) in filterSections"
              :key="section.label"
            >
              <span
                class="filter-section-title"
                :class="{ 'method-options': sectionIndex > 0 }"
              >
                {{ section.label }}
              </span>
              <label
                v-for="filter in section.filters"
                :key="filter.id"
                class="node-type-option"
                :class="{ unavailable: filterCount(filter.id) === 0 }"
              >
                <input
                  type="checkbox"
                  :value="filter.id"
                  :checked="selectedFilterIds.has(filter.id)"
                  @change="setFilterVisible(filter.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ filter.label }}</span>
                <span class="node-type-count">{{ filterCount(filter.id) }}</span>
              </label>
            </template>
          </fieldset>
        </details>
      </div>
      <VueFlow
        :id="FLOW_ID"
        class="benode-flow"
        :nodes="flowNodes"
        :edges="flowEdges"
        :min-zoom="0.2"
        :max-zoom="2"
        :nodes-connectable="false"
        :nodes-draggable="false"
        :elements-selectable="true"
        :only-render-visible-elements="true"
        fit-view-on-init
        @init="setFlowInstance"
        @nodes-initialized="fitGraph"
        @pane-click="clearFocus"
      >
        <template #node-benode-group="slotProps">
          <GraphGroupCard
            :group="groupData(slotProps.data).group"
            :selected="isGroupSelected(slotProps.id)"
            :http-methods="endpointMethods(groupData(slotProps.data).group.isRoot)"
            :base-paths="endpointBasePaths(groupData(slotProps.data).group.isRoot)"
            :urls="httpClientUrls(groupData(slotProps.data).group)"
            :tables="entityTables(groupData(slotProps.data).group)"
            @focus="focusGroup"
          />
        </template>
        <template #node-benode-method="slotProps">
          <GraphNodeCard
            :node="graphNodeData(slotProps.data).graphNode"
            :show-role="false"
            :selected="isNodeSelected(slotProps.id)"
            :http-methods="graphNodeMethods(graphNodeData(slotProps.data).graphNode, graphNodeData(slotProps.data).isRoot)"
            :paths="graphNodePaths(graphNodeData(slotProps.data).graphNode, graphNodeData(slotProps.data).isRoot)"
            @focus="focusNode"
            @navigate="navigate"
          />
        </template>
        <template #edge-benode-routed="slotProps">
          <BenodeRoutedEdge v-bind="slotProps" />
        </template>
      </VueFlow>
    </section>
  </main>
</template>
