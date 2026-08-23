import {
  directoryUri,
  type AnalysisDiagnostic,
  type ApplicationDescriptor,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceDetectionRequest,
  type WorkspaceDetectionResult,
} from "@benode/core";

import { scanApplications } from "./application-scanner.js";
import type { BuildModule } from "./build-modules.js";
import { SPRING_DISCOVERY_DIAGNOSTIC_CODES } from "./constants.js";
import { discoveryDiagnostic, errorMessage } from "./diagnostics.js";
import { findJavaFiles } from "./source-discovery.js";
import type { SpringWorkspaceDiscovererDependencies } from "./types.js";

export type BuildModuleDiscoverer = (
  fileSystem: ReadonlyWorkspaceFileSystem,
  request: WorkspaceDetectionRequest,
  workspaceUri: string,
  diagnostics: AnalysisDiagnostic[],
) => Promise<readonly BuildModule[]>;

function result(
  applications: WorkspaceDetectionResult["applications"],
  diagnostics: readonly AnalysisDiagnostic[],
): WorkspaceDetectionResult {
  return {
    applications,
    diagnostics,
  };
}

export async function detectBuildWorkspace(
  dependencies: SpringWorkspaceDiscovererDependencies,
  request: WorkspaceDetectionRequest,
  discoverModules: BuildModuleDiscoverer,
): Promise<WorkspaceDetectionResult> {
  const diagnostics: AnalysisDiagnostic[] = [];
  let workspaceUri: string;

  try {
    workspaceUri = directoryUri(request.workspaceUri);
  } catch (error) {
    diagnostics.push(
      discoveryDiagnostic(
        SPRING_DISCOVERY_DIAGNOSTIC_CODES.INVALID_WORKSPACE_URI,
        "error",
        "The workspace URI is not a valid absolute URI.",
        {
          error: errorMessage(error),
          workspaceUri: request.workspaceUri,
        },
      ),
    );
    return result([], diagnostics);
  }

  const modules = await discoverModules(
    dependencies.fileSystem,
    request,
    workspaceUri,
    diagnostics,
  );
  if (modules.length === 0) {
    return result([], diagnostics);
  }

  const applications: ApplicationDescriptor[] = [];
  for (const module of modules) {
    const javaUris = await findJavaFiles(
      dependencies.fileSystem,
      module.sourceRoots,
      request,
      diagnostics,
    );
    applications.push(
      ...(await scanApplications({
        ...dependencies,
        workspaceUri,
        moduleRelativeUri: module.relativeUri,
        moduleRootUri: module.rootUri,
        sourceRoots: module.sourceRoots,
        javaUris,
        diagnostics,
      })),
    );
  }

  if (applications.length === 0) {
    diagnostics.push(
      discoveryDiagnostic(
        SPRING_DISCOVERY_DIAGNOSTIC_CODES.NO_APPLICATIONS,
        "information",
        "No type annotated with Spring Boot's @SpringBootApplication was found.",
        { rootUri: workspaceUri },
      ),
    );
  }
  return result(
    applications.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  );
}
