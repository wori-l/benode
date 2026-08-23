import type {
  WorkspaceDetectionRequest,
  WorkspaceDetectionResult,
} from "@benode/core";

import { detectBuildWorkspace } from "./build-workspace-discovery.js";
import { discoverGradleModules } from "./gradle-modules.js";
import type { SpringWorkspaceDiscovererDependencies } from "./types.js";

export function discoverGradleWorkspace(
  dependencies: SpringWorkspaceDiscovererDependencies,
  request: WorkspaceDetectionRequest,
): Promise<WorkspaceDetectionResult> {
  return detectBuildWorkspace(
    dependencies,
    request,
    discoverGradleModules,
  );
}
