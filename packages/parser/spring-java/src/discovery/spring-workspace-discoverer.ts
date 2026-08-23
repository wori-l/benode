import {
  type AnalysisDiagnostic,
  type ApplicationDescriptor,
  type WorkspaceDetectionRequest,
  type WorkspaceDetectionResult,
  type WorkspaceDiscoverer,
} from "@benode/core";

import {
  GRADLE_DISCOVERY_DIAGNOSTIC_CODES,
  MAVEN_DISCOVERY_DIAGNOSTIC_CODES,
} from "./constants.js";
import { discoverGradleWorkspace } from "./gradle-workspace-discoverer.js";
import type { SpringWorkspaceDiscovererDependencies } from "./types.js";
import { discoverMavenWorkspace } from "./workspace-discoverer.js";

const ABSENT_BUILD_CODES = new Set<string>([
  MAVEN_DISCOVERY_DIAGNOSTIC_CODES.MAVEN_POM_NOT_FOUND,
  GRADLE_DISCOVERY_DIAGNOSTIC_CODES.GRADLE_BUILD_NOT_FOUND,
]);

function diagnosticKey(diagnostic: AnalysisDiagnostic): string {
  return JSON.stringify(diagnostic);
}

function uniqueDiagnostics(
  diagnostics: readonly AnalysisDiagnostic[],
): readonly AnalysisDiagnostic[] {
  const byKey = new Map<string, AnalysisDiagnostic>();
  for (const diagnostic of diagnostics) {
    byKey.set(diagnosticKey(diagnostic), diagnostic);
  }
  return [...byKey.values()];
}

export class SpringWorkspaceDiscoverer implements WorkspaceDiscoverer {
  readonly #dependencies: SpringWorkspaceDiscovererDependencies;

  constructor(dependencies: SpringWorkspaceDiscovererDependencies) {
    this.#dependencies = dependencies;
  }

  async detect(
    request: WorkspaceDetectionRequest,
  ): Promise<WorkspaceDetectionResult> {
    const maven = await discoverMavenWorkspace(this.#dependencies, request);
    const gradle = await discoverGradleWorkspace(
      this.#dependencies,
      request,
    );
    const applicationsById = new Map<string, ApplicationDescriptor>();
    for (const application of [
      ...maven.applications,
      ...gradle.applications,
    ]) {
      applicationsById.set(application.id, application);
    }
    const applications = [...applicationsById.values()].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    const buildRecognized =
      applications.length > 0 ||
      [...maven.diagnostics, ...gradle.diagnostics].some(
        (diagnostic) =>
          diagnostic.code ===
          MAVEN_DISCOVERY_DIAGNOSTIC_CODES.NO_APPLICATIONS,
      );
    const diagnostics = uniqueDiagnostics(
      [...maven.diagnostics, ...gradle.diagnostics].filter(
        (diagnostic) =>
          (!buildRecognized || !ABSENT_BUILD_CODES.has(diagnostic.code)) &&
          (applications.length === 0 ||
            diagnostic.code !==
              MAVEN_DISCOVERY_DIAGNOSTIC_CODES.NO_APPLICATIONS),
      ),
    );

    return {
      applications,
      diagnostics,
    };
  }
}
