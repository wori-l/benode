import * as vscode from "vscode";

import type {
  ApplicationCatalogNode,
  CatalogNode,
} from "./catalog-model.js";

function children(node: CatalogNode): readonly CatalogNode[] {
  switch (node.kind) {
    case "application":
      return node.controllers;
    case "controller":
      return node.endpoints;
    case "endpoint":
      return [];
  }
}

export class CatalogTreeProvider
  implements vscode.TreeDataProvider<CatalogNode>
{
  readonly #changeEmitter = new vscode.EventEmitter<
    CatalogNode | undefined | null
  >();
  #applications: readonly ApplicationCatalogNode[] = [];

  readonly onDidChangeTreeData = this.#changeEmitter.event;

  update(applications: readonly ApplicationCatalogNode[]): void {
    this.#applications = applications;
    this.#changeEmitter.fire(undefined);
  }

  getTreeItem(node: CatalogNode): vscode.TreeItem {
    const hasChildren = children(node).length > 0;
    const item = new vscode.TreeItem(
      node.label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = "benode:" + node.kind + ":" + node.id;
    item.contextValue = "benode." + node.kind;

    switch (node.kind) {
      case "application":
        item.iconPath = new vscode.ThemeIcon("server-environment");
        item.description =
          node.controllers.length.toString() + " controller(s)";
        break;
      case "controller":
        item.iconPath = new vscode.ThemeIcon("symbol-class");
        item.description = node.qualifiedName;
        break;
      case "endpoint":
        item.iconPath = new vscode.ThemeIcon("symbol-method");
        item.description = node.handlerName;
        item.command = {
          command: "benode.openEndpointGraph",
          title: "Open endpoint graph",
          arguments: [node],
        };
        break;
    }

    return item;
  }

  getChildren(node?: CatalogNode): CatalogNode[] {
    return [
      ...(node === undefined ? this.#applications : children(node)),
    ];
  }

  dispose(): void {
    this.#changeEmitter.dispose();
  }
}
