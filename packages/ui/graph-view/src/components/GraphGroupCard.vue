<script setup lang="ts">
import type { HttpMethod } from "@benode/core";
import { Handle, Position } from "@vue-flow/core";

import type { GraphGroup } from "../graph/graph-grouping.js";
import { displayPath } from "../contracts/method-contract.js";

defineProps<{
  group: GraphGroup;
  selected: boolean;
  httpMethods: readonly HttpMethod[];
  basePaths: readonly string[];
  urls: readonly string[];
  tables: readonly string[];
}>();

const emit = defineEmits<{
  focus: [groupId: string];
}>();
</script>

<template>
  <Handle type="target" :position="Position.Left" />
  <div
    class="graph-group-card"
    :class="{ detailed: group.methods.length > 0, selected }"
    :title="`${group.role}: ${group.qualifiedName}`"
  >
    <button
      class="group-focus-target"
      type="button"
      :aria-label="`Focus ${group.role} class ${group.qualifiedName}`"
      :aria-pressed="selected"
      @click.stop="emit('focus', group.id)"
    >
      <span class="group-topline">
        <span class="group-role">{{ group.role }}</span>
      </span>
      <strong class="group-title">{{ group.name }}</strong>
      <span class="group-namespace">{{ group.namespaceName }}</span>
      <span v-if="httpMethods.length > 0 || basePaths.length > 0" class="endpoint-route">
        <code v-for="path in basePaths" :key="path" class="route-path">
          {{ displayPath(path) }}
        </code>
      </span>
      <span v-if="urls.length > 0" class="endpoint-route">
        <span class="base-path-label">URL</span>
        <code v-for="url in urls" :key="url" class="route-path">
          {{ url }}
        </code>
      </span>
      <span v-if="tables.length > 0" class="endpoint-route">
        <span class="base-path-label">Table</span>
        <code v-for="table in tables" :key="table" class="route-path">
          {{ table }}
        </code>
      </span>
    </button>
  </div>
  <Handle type="source" :position="Position.Right" />
</template>
