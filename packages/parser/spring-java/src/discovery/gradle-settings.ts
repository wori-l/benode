import {
  normalizeRelativeUri,
  relativeUriWithin,
  uniqueSorted,
  type AnalysisDiagnostic,
  type ReadonlyWorkspaceFileSystem,
} from "@benode/core";

import { GRADLE_DISCOVERY_DIAGNOSTIC_CODES } from "./constants.js";
import { discoveryDiagnostic, errorMessage } from "./diagnostics.js";

const SETTINGS_FILES = new Set([
  "settings.gradle",
  "settings.gradle.kts",
]);

function withoutComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "");
}

function quotedValues(expression: string): readonly string[] {
  return [...expression.matchAll(/["']([^"']+)["']/gu)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

function includedProjects(content: string): readonly string[] {
  const projects: string[] = [];
  const source = withoutComments(content);
  const includes =
    /\binclude\s*(?:\(([^)]*)\)|([^\r\n]+))/gu;
  for (const match of source.matchAll(includes)) {
    projects.push(...quotedValues(match[1] ?? match[2] ?? ""));
  }
  return projects;
}

function projectKey(projectPath: string): string {
  return (
    ":" +
    projectPath
      .split(":")
      .filter((segment) => segment.length > 0)
      .join(":")
  );
}

function projectDirectoryOverrides(
  content: string,
): ReadonlyMap<string, string> {
  const overrides = new Map<string, string>();
  const source = withoutComments(content);
  const assignments =
    /project\s*\(\s*["']([^"']+)["']\s*\)\s*\.projectDir\s*=\s*file\s*\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of source.matchAll(assignments)) {
    const project = match[1];
    const directory = match[2];
    if (project !== undefined && directory !== undefined) {
      overrides.set(projectKey(project), directory);
    }
  }
  return overrides;
}

function defaultProjectDirectory(projectPath: string): string {
  return projectPath
    .split(":")
    .filter((segment) => segment.length > 0)
    .join("/");
}

function withinWorkspace(relativeUri: string): boolean {
  return relativeUri !== ".." && !relativeUri.startsWith("../");
}

export async function discoverGradleSettingsModules(
  fileSystem: ReadonlyWorkspaceFileSystem,
  workspaceUri: string,
  markerUris: readonly string[],
  diagnostics: AnalysisDiagnostic[],
): Promise<readonly string[]> {
  const moduleUris: string[] = [];
  for (const settingsUri of markerUris.filter((uri) => {
    const name = uri.split("/").at(-1);
    return name !== undefined && SETTINGS_FILES.has(name);
  })) {
    let content: string;
    try {
      content = await fileSystem.readTextFile(settingsUri);
    } catch (error) {
      diagnostics.push(
        discoveryDiagnostic(
          GRADLE_DISCOVERY_DIAGNOSTIC_CODES.FILE_READ_FAILED,
          "warning",
          "A Gradle settings file could not be read during discovery.",
          { error: errorMessage(error) },
          settingsUri,
        ),
      );
      continue;
    }

    const settingsRelativeUri =
      relativeUriWithin(workspaceUri, settingsUri);
    if (settingsRelativeUri === null) {
      continue;
    }
    const separator = settingsRelativeUri.lastIndexOf("/");
    const settingsRoot =
      separator < 0 ? "" : settingsRelativeUri.slice(0, separator);
    const overrides = projectDirectoryOverrides(content);
    for (const projectPath of includedProjects(content)) {
      const projectDirectory =
        overrides.get(projectKey(projectPath)) ??
        defaultProjectDirectory(projectPath);
      const relativeUri = normalizeRelativeUri(
        [settingsRoot, projectDirectory].filter(Boolean).join("/"),
      );
      if (relativeUri !== "" && withinWorkspace(relativeUri)) {
        moduleUris.push(relativeUri);
      }
    }
  }
  return uniqueSorted(moduleUris);
}
