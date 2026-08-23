<script setup lang="ts">
import {
  BaseEdge,
  type EdgeProps,
} from "@vue-flow/core";
import { computed } from "vue";

import type { BenodeEdgeData } from "../layout/graph-layout-types.js";
import {
  routedEdgeCenter,
  routedEdgePath,
} from "../layout/routed-edge-path.js";

const props = defineProps<EdgeProps<BenodeEdgeData>>();

const path = computed(() => routedEdgePath(props.data.route));
const center = computed(() => routedEdgeCenter(props.data.route));
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path"
    :marker-start="markerStart"
    :label="label"
    :label-show-bg="true"
    :label-x="center.x"
    :label-y="center.y"
    :label-bg-padding="[7, 4]"
    :label-bg-border-radius="5"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
  />
</template>
