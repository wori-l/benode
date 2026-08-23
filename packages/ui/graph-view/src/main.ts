import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "./styles.css";

import { createApp } from "vue";

import App from "./App.vue";
import { createWebviewBridge } from "./platform/bridge.js";
import { sampleGraphMessage } from "./debug/sample-graph.js";

const bridge = createWebviewBridge();

createApp(App, {
  bridge,
  initialMessage: bridge.mode === "standalone" ? sampleGraphMessage : undefined,
}).mount("#app");
