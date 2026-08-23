import { webcrypto } from "node:crypto";

import * as vscode from "vscode";

import {
  ANALYSIS_WATCH_GLOBS,
} from "./analysis/extension-workspace-analyzer.js";
import { BenodeController } from "./benode-controller.js";
import { DiagnosticStore } from "./diagnostics/diagnostic-store.js";
import type { CatalogNode, EndpointCatalogNode } from "./catalog/catalog-model.js";
import { CatalogTreeProvider } from "./catalog/catalog-tree-provider.js";
import { EndpointGraphPanel } from "./webview/endpoint-graph-panel.js";

globalThis.crypto ??= webcrypto as unknown as Crypto;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CatalogTreeProvider();
  const treeView = vscode.window.createTreeView<CatalogNode>(
    "benode.applications",
    { treeDataProvider: provider },
  );
  const output = vscode.window.createOutputChannel("Benode", { log: true });
  const diagnostics = new DiagnosticStore(output);
  const graphPanel = new EndpointGraphPanel(context.extensionUri, diagnostics);
  const controller = new BenodeController(
    provider,
    treeView,
    diagnostics,
    graphPanel,
    context.extensionUri.fsPath,
    String(context.extension.packageJSON["version"]),
    context.storageUri,
  );

  const analysisWatchers = ANALYSIS_WATCH_GLOBS.map((glob) =>
    vscode.workspace.createFileSystemWatcher(glob),
  );
  const watch = (
    watcher: vscode.FileSystemWatcher,
  ): readonly vscode.Disposable[] => [
    watcher,
    watcher.onDidCreate((uri) => {
      controller.scheduleFileChange(uri.toString(), false);
    }),
    watcher.onDidChange((uri) => {
      controller.scheduleFileChange(uri.toString(), false);
    }),
    watcher.onDidDelete((uri) => {
      controller.scheduleFileChange(uri.toString(), true);
    }),
  ];
  context.subscriptions.push(
    provider,
    treeView,
    controller,
    ...analysisWatchers.flatMap(watch),
    output,
    graphPanel,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("benode.excludedPackages")) {
        void controller.reindex();
      }
    }),
    treeView.onDidChangeVisibility((event) => {
      if (event.visible) {
        void controller.ensureIndexed();
      }
    }),
    vscode.commands.registerCommand(
      "benode.reindexWorkspace",
      () => controller.reindex(),
    ),
    vscode.commands.registerCommand(
      "benode.cleanAndReindexWorkspace",
      () => controller.cleanAndReindex(),
    ),
    vscode.commands.registerCommand(
      "benode.openEndpointGraph",
      (node: EndpointCatalogNode) => controller.openEndpointGraph(node),
    ),
    vscode.commands.registerCommand(
      "benode.showAnalysisDiagnostics",
      async () => {
        await controller.ensureIndexed();
        controller.showDiagnostics();
      },
    ),
  );

  if (treeView.visible) {
    void controller.ensureIndexed();
  }
}

export function deactivate(): void {}
