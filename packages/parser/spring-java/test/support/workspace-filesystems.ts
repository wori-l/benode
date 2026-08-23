import { globSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

import type {
  ReadonlyWorkspaceFileSearch,
  ReadonlyWorkspaceFileSystem,
} from "@benode/core";
import {
  REPOSITORY_ROOT,
  TEST_SERVICE_ROOT,
} from "./java-adapter.js";

function directoryUrl(uri: string): URL {
  return new URL(uri.endsWith("/") ? uri : uri + "/");
}

export function childUri(
  rootUri: string,
  relativeUri: string,
): string {
  return new URL(relativeUri, directoryUrl(rootUri)).toString();
}

function globPattern(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (character === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (character === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(
        /[\\^$.[\]{}()+|]/gu,
        "\\$&",
      );
    }
  }

  return new RegExp(source + "$", "u");
}

function isExcluded(
  relativeUri: string,
  excludeGlobs: readonly string[],
): boolean {
  return excludeGlobs.some((pattern) =>
    globPattern(pattern).test(relativeUri),
  );
}

export const TEST_SERVICE_URI =
  pathToFileURL(TEST_SERVICE_ROOT).toString();

export const GRADLE_MULTI_APP_ROOT = resolve(
  REPOSITORY_ROOT,
  "fixtures/springboot-multiapp-srv",
);

export const GRADLE_MULTI_APP_URI =
  pathToFileURL(GRADLE_MULTI_APP_ROOT).toString();

export function testServiceFileUri(relativeUri: string): string {
  return pathToFileURL(
    resolve(TEST_SERVICE_ROOT, relativeUri),
  ).toString();
}

export class NodeFixtureFileSystem
  implements ReadonlyWorkspaceFileSystem
{
  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    const rootPath = fileURLToPath(request.rootUri);
    return globSync(request.includeGlob, {
      cwd: rootPath,
      exclude: request.excludeGlobs,
    }).map((relativeUri) =>
      pathToFileURL(resolve(rootPath, relativeUri)).toString(),
    );
  }

  async readTextFile(uri: string): Promise<string> {
    return readFile(fileURLToPath(uri), "utf8");
  }
}

interface MemoryFileSystemOptions {
  readonly unreadableUris?: readonly string[];
  readonly failedSearchRoots?: readonly string[];
}

export class MemoryFileSystem
  implements ReadonlyWorkspaceFileSystem
{
  readonly #files: ReadonlyMap<string, string>;
  readonly #unreadableUris: ReadonlySet<string>;
  readonly #failedSearchRoots: ReadonlySet<string>;

  constructor(
    files: Readonly<Record<string, string>>,
    options: MemoryFileSystemOptions = {},
  ) {
    this.#files = new Map(Object.entries(files));
    this.#unreadableUris = new Set(options.unreadableUris);
    this.#failedSearchRoots = new Set(
      options.failedSearchRoots,
    );
  }

  async findFiles(
    request: ReadonlyWorkspaceFileSearch,
  ): Promise<readonly string[]> {
    if (this.#failedSearchRoots.has(request.rootUri)) {
      throw new Error("Synthetic search failure");
    }

    const root = directoryUrl(request.rootUri).toString();
    const matches: string[] = [];
    for (const uri of this.#files.keys()) {
      if (!uri.startsWith(root)) {
        continue;
      }

      const relativeUri = decodeURIComponent(
        uri.slice(root.length),
      );
      const markerName = request.includeGlob.startsWith("**/")
        ? request.includeGlob.slice(3)
        : request.includeGlob;
      const buildMarkers = new Set([
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle",
        "settings.gradle.kts",
      ]);
      const included = buildMarkers.has(markerName)
        ? relativeUri.split("/").at(-1) === markerName
        : request.includeGlob === "**/*.java" &&
          relativeUri.endsWith(".java");
      if (
        included &&
        !isExcluded(relativeUri, request.excludeGlobs)
      ) {
        matches.push(uri);
      }
    }

    return matches.reverse();
  }

  async readTextFile(uri: string): Promise<string> {
    if (this.#unreadableUris.has(uri)) {
      throw new Error("Synthetic read failure");
    }

    const content = this.#files.get(uri);
    if (content === undefined) {
      throw new Error("Missing in-memory file: " + uri);
    }
    return content;
  }
}
