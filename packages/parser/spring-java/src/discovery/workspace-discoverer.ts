import type {
  WorkspaceDetectionRequest,
  WorkspaceDetectionResult,
} from "@benode/core";

import { detectBuildWorkspace } from "./build-workspace-discovery.js";
import { discoverMavenModules } from "./maven-modules.js";
import type { SpringWorkspaceDiscovererDependencies } from "./types.js";

export function discoverMavenWorkspace(
  dependencies: SpringWorkspaceDiscovererDependencies,
  request: WorkspaceDetectionRequest,
): Promise<WorkspaceDetectionResult> {
  return detectBuildWorkspace(
    dependencies,
    request,
    discoverMavenModules,
  );
}
