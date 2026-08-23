import type {
  AnalysisDiagnostic,
  ReadonlyWorkspaceFileSystem,
  WorkspaceDetectionRequest,
} from "@benode/core";

import { MAVEN_DISCOVERY_DIAGNOSTIC_CODES } from "./constants.js";
import {
  discoverBuildModules,
  type BuildModule,
} from "./build-modules.js";

export type MavenModule = BuildModule;

export function discoverMavenModules(
  fileSystem: ReadonlyWorkspaceFileSystem,
  request: WorkspaceDetectionRequest,
  workspaceUri: string,
  diagnostics: AnalysisDiagnostic[],
): Promise<readonly MavenModule[]> {
  return discoverBuildModules(
    fileSystem,
    request,
    workspaceUri,
    {
      markerGlobs: ["**/pom.xml"],
      markerFileNames: ["pom.xml"],
      missingMarkerCode:
        MAVEN_DISCOVERY_DIAGNOSTIC_CODES.MAVEN_POM_NOT_FOUND,
      missingMarkerMessage: "No pom.xml was found in the workspace.",
      searchFailedCode:
        MAVEN_DISCOVERY_DIAGNOSTIC_CODES.FILE_SEARCH_FAILED,
      searchFailedMessage:
        "Maven project markers could not be searched.",
    },
    diagnostics,
  );
}
