import type {
  ReadonlyWorkspaceFileSystem,
  WorkspaceAnalysisState,
} from "@benode/core";
import {
  SPRING_JAVA_WATCH_GLOBS,
  SPRING_JAVA_WORKSPACE_PROFILE,
  SpringWorkspaceAnalyzer,
} from "@benode/spring-java";

import type { ExtensionTechnologyAnalysis } from "./technology-analysis.js";

async function hasFiles(
  fileSystem: ReadonlyWorkspaceFileSystem,
  workspaceUri: string,
  includeGlob: string,
): Promise<boolean> {
  return (
    await fileSystem.findFiles({
      rootUri: workspaceUri,
      includeGlob,
      excludeGlobs: ["**/node_modules/**", "**/dist/**", "**/build/**"],
    })
  ).length > 0;
}

const springAnalysis: ExtensionTechnologyAnalysis = {
  parserId: SPRING_JAVA_WORKSPACE_PROFILE.parserId,
  watchGlobs: SPRING_JAVA_WATCH_GLOBS,
  matchesWorkspace: async (fileSystem, workspaceUri) =>
    (await hasFiles(fileSystem, workspaceUri, "**/pom.xml")) ||
    (await hasFiles(fileSystem, workspaceUri, "**/*.gradle")) ||
    hasFiles(fileSystem, workspaceUri, "**/*.gradle.kts"),
  createWorkspaceAnalyzer: (dependencies) =>
    new SpringWorkspaceAnalyzer(dependencies),
};

export const technologyAnalyses: readonly ExtensionTechnologyAnalysis[] = [
  springAnalysis,
];

export function technologyAnalysisByParserId(
  parserId: string,
): ExtensionTechnologyAnalysis | undefined {
  return technologyAnalyses.find((analysis) => analysis.parserId === parserId);
}

export async function selectTechnologyAnalysis(
  fileSystem: ReadonlyWorkspaceFileSystem,
  workspaceUri: string,
  previousState: WorkspaceAnalysisState | undefined,
): Promise<ExtensionTechnologyAnalysis> {
  const previous =
    previousState === undefined
      ? undefined
      : technologyAnalysisByParserId(previousState.parserId);
  if (previous !== undefined) {
    return previous;
  }
  for (const analysis of technologyAnalyses) {
    if (await analysis.matchesWorkspace(fileSystem, workspaceUri)) {
      return analysis;
    }
  }
  return springAnalysis;
}
