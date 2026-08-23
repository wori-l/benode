import { randomBytes } from "node:crypto";

import {
  parseWebviewToHostMessage,
  type EndpointGraphErrorCode,
  type HostToWebviewMessage,
  type ShowEndpointGraphMessage,
} from "@benode/core";
import * as vscode from "vscode";

import { EXTENSION_DIAGNOSTIC_CODES } from "../diagnostics/diagnostic-store.js";
import type { DiagnosticStore } from "../diagnostics/diagnostic-store.js";

export class EndpointGraphPanel implements vscode.Disposable {
  readonly #extensionUri: vscode.Uri;
  #panel: vscode.WebviewPanel | undefined;
  readonly #diagnostics: DiagnosticStore;
  #graphMessage: ShowEndpointGraphMessage | undefined;
  #pendingMessage: HostToWebviewMessage | undefined;
  #ready = false;

  constructor(extensionUri: vscode.Uri, diagnostics: DiagnosticStore) {
    this.#extensionUri = extensionUri;
    this.#diagnostics = diagnostics;
  }

  async show(message: ShowEndpointGraphMessage): Promise<void> {
    const panel = this.#panel ?? await this.#createPanel();
    this.#graphMessage = message;
    this.#pendingMessage = message;
    panel.title = this.#panelTitle(message);
    panel.reveal(vscode.ViewColumn.Active, false);

    if (this.#ready) {
      await panel.webview.postMessage(message);
    }
  }

  currentEndpointId(): string | undefined {
    return this.#graphMessage?.endpoint.id;
  }

  update(message: ShowEndpointGraphMessage): void {
    if (this.#panel === undefined) {
      return;
    }
    this.#graphMessage = message;
    this.#pendingMessage = message;
    this.#panel.title = this.#panelTitle(message);
    if (this.#ready) {
      void this.#panel.webview.postMessage(message);
    }
  }

  showLoading(message: string): void {
    this.#send({
      type: "endpointGraphLoading",
      message,
    });
  }

  showError(code: EndpointGraphErrorCode, message: string): void {
    this.#send({
      type: "endpointGraphError",
      code,
      message,
    });
  }

  #send(message: HostToWebviewMessage): void {
    if (this.#panel === undefined) {
      return;
    }
    this.#pendingMessage = message;
    if (this.#ready) {
      void this.#panel.webview.postMessage(message);
    }
  }

  dispose(): void {
    this.#panel?.dispose();
    this.#panel = undefined;
    this.#graphMessage = undefined;
    this.#pendingMessage = undefined;
    this.#ready = false;
  }

  async #createPanel(): Promise<vscode.WebviewPanel> {
    const assetsUri = vscode.Uri.joinPath(
      this.#extensionUri,
      "dist",
      "webview-assets",
    );
    const panel = vscode.window.createWebviewPanel(
      "benode.endpointGraph",
      "Endpoint graph",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [assetsUri],
        retainContextWhenHidden: true,
      },
    );
    panel.webview.html = this.#html(panel.webview, assetsUri);
    panel.webview.onDidReceiveMessage((value: unknown) => {
      void this.#receiveMessage(value);
    });
    panel.onDidDispose(() => {
      if (this.#panel === panel) {
        this.#panel = undefined;
        this.#graphMessage = undefined;
        this.#pendingMessage = undefined;
        this.#ready = false;
      }
    });
    this.#panel = panel;
    return panel;
  }

  async #receiveMessage(value: unknown): Promise<void> {
    const message = parseWebviewToHostMessage(value);
    if (message === null) {
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.invalidWebviewMessage,
        "The endpoint graph webview sent an invalid or incompatible message.",
        "warning",
      );
      return;
    }

    if (message.type === "ready") {
      this.#ready = true;
      if (this.#pendingMessage !== undefined) {
        await this.#panel?.webview.postMessage(this.#pendingMessage);
      }
      return;
    }

    const node = this.#graphMessage?.graph.nodes.find(
      (candidate) => candidate.id === message.nodeId,
    );
    if (node?.sourceLocation === undefined) {
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.invalidWebviewMessage,
        "The endpoint graph webview requested an unknown or non-navigable node.",
        "warning",
        { nodeId: message.nodeId },
      );
      return;
    }

    // The webview sends only an opaque node ID. Resolve the location from the
    // host-owned graph so UI input can never choose an arbitrary URI.
    const location = node.sourceLocation;
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(location.uri, true),
      );
      const selection = new vscode.Range(
        location.start.line,
        location.start.column,
        location.end.line,
        location.end.column,
      );
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
        preview: false,
        selection,
      });
      editor.revealRange(
        selection,
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = "Benode could not navigate to the selected source: " + detail;
      this.#diagnostics.report(
        EXTENSION_DIAGNOSTIC_CODES.navigationFailed,
        message,
        "error",
        { nodeId: node.id, uri: location.uri },
      );
      void vscode.window.showErrorMessage(message);
    }
  }

  #panelTitle(message: ShowEndpointGraphMessage): string {
    const methods = message.endpoint.httpMethods.length === 0
      ? "ANY"
      : message.endpoint.httpMethods.join("|");
    return methods + " " + (message.endpoint.paths.join(", ") || "/");
  }

  #html(webview: vscode.Webview, assetsUri: vscode.Uri): string {
    const nonce = randomBytes(18).toString("base64");
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(assetsUri, "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(assetsUri, "webview.css"),
    );

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
    <link rel="stylesheet" href="${styleUri}">
    <title>Benode endpoint graph</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
