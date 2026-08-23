import type {
  ReadonlyWorkspaceFileSearch,
  ReadonlyWorkspaceFileSystem,
} from "@benode/core";
import * as vscode from "vscode";

function excludePattern(
  globs: readonly string[],
): string | undefined {
  if (globs.length === 0) {
    return undefined;
  }
  if (globs.length === 1) {
    return globs[0];
  }
  return "{" + globs.join(",") + "}";
}

export class VsCodeWorkspaceFileSystem
  implements ReadonlyWorkspaceFileSystem
{
  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    const include = new vscode.RelativePattern(
      vscode.Uri.parse(request.rootUri),
      request.includeGlob,
    );
    const matches = await vscode.workspace.findFiles(
      include,
      excludePattern(request.excludeGlobs),
    );

    return matches
      .map((uri) => uri.toString())
      .sort((left, right) => left.localeCompare(right));
  }

  async readTextFile(uri: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.parse(uri),
    );
    return new TextDecoder().decode(bytes);
  }
}
