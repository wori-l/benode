import { glob, readFile } from "node:fs/promises";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";
import { resolve } from "node:path";

import type {
  ReadonlyWorkspaceFileSearch,
  ReadonlyWorkspaceFileSystem,
} from "@benode/core";

export class NodeWorkspaceFileSystem
  implements ReadonlyWorkspaceFileSystem
{
  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    const rootPath = fileURLToPath(request.rootUri);
    const relativePaths: string[] = [];
    for await (const relativePath of glob(request.includeGlob, {
      cwd: rootPath,
      exclude: request.excludeGlobs,
    })) {
      relativePaths.push(relativePath);
    }
    return relativePaths
      .sort()
      .map((relativePath) =>
        pathToFileURL(resolve(rootPath, relativePath)).toString(),
      );
  }

  async readTextFile(uri: string): Promise<string> {
    return readFile(fileURLToPath(uri), "utf8");
  }
}
