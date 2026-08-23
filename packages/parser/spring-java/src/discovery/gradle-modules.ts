import type {
  AnalysisDiagnostic,
  ReadonlyWorkspaceFileSystem,
  WorkspaceDetectionRequest,
} from "@benode/core";

import { GRADLE_DISCOVERY_DIAGNOSTIC_CODES } from "./constants.js";
import {
  discoverBuildModules,
  type BuildModule,
} from "./build-modules.js";
import { discoverGradleSettingsModules } from "./gradle-settings.js";

export type GradleModule = BuildModule;

const GRADLE_MARKERS = [
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
] as const;

export function discoverGradleModules(
  fileSystem: ReadonlyWorkspaceFileSystem,
  request: WorkspaceDetectionRequest,
  workspaceUri: string,
  diagnostics: AnalysisDiagnostic[],
): Promise<readonly GradleModule[]> {
  return discoverBuildModules(
    fileSystem,
    request,
    workspaceUri,
    {
      markerGlobs: GRADLE_MARKERS.map((marker) => "**/" + marker),
      markerFileNames: GRADLE_MARKERS,
      missingMarkerCode:
        GRADLE_DISCOVERY_DIAGNOSTIC_CODES.GRADLE_BUILD_NOT_FOUND,
      missingMarkerMessage:
        "No Gradle build or settings file was found in the workspace.",
      searchFailedCode:
        GRADLE_DISCOVERY_DIAGNOSTIC_CODES.FILE_SEARCH_FAILED,
      searchFailedMessage:
        "Gradle project markers could not be searched.",
      additionalModuleRelativeUris: (markerUris) =>
        discoverGradleSettingsModules(
          fileSystem,
          workspaceUri,
          markerUris,
          diagnostics,
        ),
    },
    diagnostics,
  );
}
