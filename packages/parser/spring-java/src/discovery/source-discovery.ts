import {
  normalizeRelativeUri,
  relativeUriWithin,
  resolveDirectoryUri,
  uniqueSorted,
  type AnalysisDiagnostic,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceDetectionRequest,
} from "@benode/core";

import {
  DEFAULT_SOURCE_ROOT,
  GENERATED_SOURCE_GLOBS,
  SPRING_DISCOVERY_DIAGNOSTIC_CODES,
} from "./constants.js";
import {
  discoveryDiagnostic,
  errorMessage,
} from "./diagnostics.js";

function isGeneratedSourceRoot(relativeUri: string): boolean {
  const segments = normalizeRelativeUri(relativeUri).split("/");
  return (
    segments.includes("generated") ||
    segments.includes("generated-sources")
  );
}

export function resolveSourceRoots(
  request: WorkspaceDetectionRequest,
  workspaceUri: string,
  diagnostics: AnalysisDiagnostic[],
): readonly string[] {
  const configuredRoots =
    request.sourceRoots.length === 0
      ? [DEFAULT_SOURCE_ROOT]
      : request.sourceRoots;
  const sourceRoots: string[] = [];

  for (const configuredRoot of configuredRoots) {
    let sourceRootUri: string;
    try {
      sourceRootUri = resolveDirectoryUri(
        workspaceUri,
        configuredRoot,
      );
    } catch (error) {
      diagnostics.push(
        discoveryDiagnostic(
          SPRING_DISCOVERY_DIAGNOSTIC_CODES.INVALID_SOURCE_ROOT,
          "warning",
          "A configured source root is not a valid URI or path.",
          { configuredRoot, error: errorMessage(error) },
        ),
      );
      continue;
    }

    const relativeSourceRoot = relativeUriWithin(
      workspaceUri,
      sourceRootUri,
    );
    if (relativeSourceRoot === null) {
      diagnostics.push(
        discoveryDiagnostic(
          SPRING_DISCOVERY_DIAGNOSTIC_CODES.INVALID_SOURCE_ROOT,
          "warning",
          "A configured source root is outside the workspace.",
          { configuredRoot, sourceRootUri },
        ),
      );
      continue;
    }
    if (
      !request.includeGeneratedSources &&
      isGeneratedSourceRoot(relativeSourceRoot)
    ) {
      continue;
    }
    sourceRoots.push(sourceRootUri);
  }

  return uniqueSorted(sourceRoots);
}

export async function findJavaFiles(
  fileSystem: ReadonlyWorkspaceFileSystem,
  sourceRoots: readonly string[],
  request: WorkspaceDetectionRequest,
  diagnostics: AnalysisDiagnostic[],
): Promise<readonly string[]> {
  const javaUris: string[] = [];
  const excludeGlobs = request.includeGeneratedSources
    ? request.excludeGlobs
    : [...request.excludeGlobs, ...GENERATED_SOURCE_GLOBS];

  for (const sourceRoot of sourceRoots) {
    try {
      javaUris.push(
        ...(await fileSystem.findFiles({
          rootUri: sourceRoot,
          includeGlob: "**/*.java",
          excludeGlobs,
        })),
      );
    } catch (error) {
      diagnostics.push(
        discoveryDiagnostic(
          SPRING_DISCOVERY_DIAGNOSTIC_CODES.FILE_SEARCH_FAILED,
          "warning",
          "Java source files could not be searched in a source root.",
          { error: errorMessage(error), sourceRoot },
        ),
      );
    }
  }

  return uniqueSorted(javaUris);
}
