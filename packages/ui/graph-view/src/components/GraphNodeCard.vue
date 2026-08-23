<script setup lang="ts">
import type { GraphNode, HttpMethod } from "@benode/core";
import { Handle, Position } from "@vue-flow/core";
import { computed } from "vue";

import {
  displayPath,
  methodOutput,
  methodParameters,
} from "../contracts/method-contract.js";

const props = defineProps<{
  node: GraphNode;
  showRole: boolean;
  selected: boolean;
  httpMethods: readonly HttpMethod[];
  paths: readonly string[];
}>();

const emit = defineEmits<{
  focus: [nodeId: string];
  navigate: [nodeId: string];
}>();

const parameters = computed(() => methodParameters(props.node));
const output = computed(() => methodOutput(props.node));
const source = computed(() => {
  const location = props.node.sourceLocation;
  if (location === undefined) {
    return "No local source";
  }
  const fileName = decodeURIComponent(
    location.uri.split("/").at(-1) ?? location.uri,
  );
  return fileName + ":" + (location.start.line + 1).toString();
});
const accessibleLabel = computed(() => {
  const inputs = parameters.value
    .map((parameter) => parameter.name + " " + parameter.type)
    .join(", ") || "no inputs";
  const route = [
    ...props.httpMethods,
    ...props.paths.map(displayPath),
  ].join(" ");
  return [
    props.showRole ? props.node.role : "",
    props.node.symbol.name,
    route,
    "inputs " + inputs,
    "output " + output.value,
  ].filter((part) => part.length > 0).join(", ");
});

function onKeydown(event: KeyboardEvent): void {
  if (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    props.node.sourceLocation !== undefined
  ) {
    event.preventDefault();
    emit("navigate", props.node.id);
  }
}

function onClick(event: MouseEvent): void {
  if (
    (event.ctrlKey || event.metaKey) &&
    props.node.sourceLocation !== undefined
  ) {
    emit("navigate", props.node.id);
    return;
  }
  emit("focus", props.node.id);
}
</script>

<template>
  <Handle type="target" :position="Position.Left" />
  <button
    class="graph-node-card"
    :class="{ terminal: !node.sourceLocation, selected }"
    type="button"
    :aria-label="accessibleLabel"
    :aria-pressed="selected"
    @click.stop="onClick"
    @keydown="onKeydown"
  >
    <span v-if="showRole" class="node-topline">
      <span class="node-role">{{ node.role }}</span>
    </span>
    <strong>{{ node.symbol.name }}</strong>
    <span v-if="httpMethods.length > 0 || paths.length > 0" class="endpoint-route">
      <span v-for="method in httpMethods" :key="method" class="http-method">
        {{ method }}
      </span>
      <code v-for="path in paths" :key="path" class="route-path">
        {{ displayPath(path) }}
      </code>
    </span>
    <span class="method-contract">
      <span class="contract-row">
        <span class="contract-label">Input</span>
        <span class="contract-values">
          <span v-if="parameters.length === 0" class="contract-empty">
            None
          </span>
          <code
            v-for="parameter in parameters"
            :key="parameter.name"
            class="contract-value"
          >
            {{ parameter.name }}: <span>{{ parameter.type }}</span>
          </code>
        </span>
      </span>
      <span class="contract-row">
        <span class="contract-label">Output</span>
        <span class="contract-values">
          <code class="contract-value">
            <span>{{ output }}</span>
          </code>
        </span>
      </span>
    </span>
    <span class="node-source">{{ source }}</span>
  </button>
  <Handle type="source" :position="Position.Right" />
</template>
