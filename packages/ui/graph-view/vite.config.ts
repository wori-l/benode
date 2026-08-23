import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
    outDir: fileURLToPath(new URL("dist", import.meta.url)),
    rollupOptions: {
      output: {
        entryFileNames: "webview.js",
        assetFileNames: "webview[extname]",
      },
    },
  },
  test: {
    environment: "happy-dom",
  },
});
