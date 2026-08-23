import type { FrameworkIndex } from "@benode/core";
import * as vscode from "vscode";

import { EXTENSION_DIAGNOSTIC_CODES } from "../diagnostics/diagnostic-store.js";
import type { DiagnosticStore } from "../diagnostics/diagnostic-store.js";
import {
  createEndpointGraphMessage,
  refreshEndpointGraphPanel,
} from "./endpoint-graph-message.js";
import type { EndpointGraphPanel } from "./endpoint-graph-panel.js";

const ENDPOINT_UNAVAILABLE_MESSAGE =
  "Benode could not find the selected endpoint. Reindex the workspace and try again.";

export class EndpointGraphLifecycle {
  readonly #diagnostics: DiagnosticStore;
  readonly #panel: EndpointGraphPanel;

  constructor(panel: EndpointGraphPanel, diagnostics: DiagnosticStore) {
    this.#panel = panel;
    this.#diagnostics = diagnostics;
  }

  showLoading(): void {
    this.#panel.showLoading("Reindexing endpoint graph…");
  }

  showAnalysisError(message: string): void {
    this.#panel.showError("analysisFailed", message);
  }

  showUnavailable(message: string): void {
    this.#panel.showError("endpointUnavailable", message);
  }

  async refresh(index: FrameworkIndex): Promise<void> {
    try {
      const result = await refreshEndpointGraphPanel(this.#panel, index);
      if (result !== "endpointUnavailable") {
        return;
      }
      const message =
        "The selected endpoint is no longer available after reindexing.";
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.endpointUnavailable,
        message,
        "warning",
      );
      this.showUnavailable(message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.graphUnavailable,
        "Unable to refresh endpoint graph: " + message,
      );
      this.showAnalysisError("The endpoint graph could not be refreshed.");
    }
  }

  async open(index: FrameworkIndex | undefined, endpointId: string): Promise<void> {
    if (index === undefined) {
      this.#reportUnavailable();
      return;
    }

    try {
      const message = await createEndpointGraphMessage(index, endpointId);
      if (message === undefined) {
        this.#reportUnavailable();
        return;
      }
      await this.#panel.show(message);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.graphUnavailable,
        "Unable to open endpoint graph: " + detail,
      );
      void vscode.window.showErrorMessage(
        "Benode could not open the endpoint graph: " + detail,
      );
    }
  }

  #reportUnavailable(): void {
    this.#diagnostics.report(
      EXTENSION_DIAGNOSTIC_CODES.endpointUnavailable,
      ENDPOINT_UNAVAILABLE_MESSAGE,
      "warning",
    );
    void vscode.window.showErrorMessage(ENDPOINT_UNAVAILABLE_MESSAGE);
  }
}
