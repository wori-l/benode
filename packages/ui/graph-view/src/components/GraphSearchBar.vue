<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  query: string;
  position: string;
  resultCount: number;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  move: [direction: 1 | -1];
  clear: [];
}>();

const input = ref<HTMLInputElement>();

function focusSearch(): void {
  input.value?.focus();
  input.value?.select();
}

function updateQuery(event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    emit("update:query", event.target.value);
  }
}

function clearSearch(blur: boolean): void {
  emit("clear");
  if (blur) {
    input.value?.blur();
  }
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    emit("move", event.shiftKey ? -1 : 1);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    clearSearch(true);
  }
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "f"
  ) {
    event.preventDefault();
    focusSearch();
  }
}

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKeydown));
</script>

<template>
  <div class="graph-search" role="search">
    <label class="visually-hidden" for="graph-search-input">
      Search methods and classes
    </label>
    <input
      id="graph-search-input"
      ref="input"
      :value="props.query"
      class="graph-search-input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      placeholder="Search methods or classes"
      @input="updateQuery"
      @keydown="onInputKeydown"
    />
    <output class="graph-search-count" aria-live="polite" aria-atomic="true">
      {{ props.position }}
    </output>
    <button
      class="graph-search-action"
      type="button"
      title="Previous result (Shift+Enter)"
      aria-label="Previous search result"
      :disabled="props.resultCount === 0"
      @click="emit('move', -1)"
    >↑</button>
    <button
      class="graph-search-action"
      type="button"
      title="Next result (Enter)"
      aria-label="Next search result"
      :disabled="props.resultCount === 0"
      @click="emit('move', 1)"
    >↓</button>
    <button
      class="graph-search-action"
      type="button"
      title="Clear search (Escape)"
      aria-label="Clear graph search"
      :disabled="props.query.length === 0"
      @click="clearSearch(false)"
    >×</button>
  </div>
</template>
