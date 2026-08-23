import type { WebviewToHostMessage } from "@benode/core";

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

export interface WebviewBridge {
  readonly mode: "standalone" | "vscode";
  postMessage(message: WebviewToHostMessage): void;
  subscribe(listener: (message: unknown) => void): () => void;
}

export function createWebviewBridge(): WebviewBridge {
  const acquireApi = globalThis.acquireVsCodeApi;
  const api = typeof acquireApi === "function" ? acquireApi() : undefined;

  return {
    mode: api === undefined ? "standalone" : "vscode",
    postMessage(message): void {
      api?.postMessage(message);
    },
    subscribe(listener): () => void {
      const receive = (event: MessageEvent<unknown>): void => {
        listener(event.data);
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    },
  };
}
