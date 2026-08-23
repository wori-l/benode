import {
  normalizeRelativeUri,
  relativeUriWithin,
  resolveDirectoryUri,
  uniqueSorted,
  type AnalysisDiagnostic,
  type ReadonlyWorkspaceFileSystem,
  type WorkspaceDetectionRequest,
} from "@benode/core";

import type { SpringDiscoveryDiagnosticCode } from "./constants.js";
import { discoveryDiagnostic, errorMessage } from "./diagnostics.js";
import { resolveSourceRoots } from "./source-discovery.js";

export interface BuildModule {
  readonly relativeUri: string;
  readonly rootUri: string;
  readonly sourceRoots: readonly string[];
}

export interface BuildModuleDiscovery {
  readonly markerGlobs: readonly string[];
  readonly markerFileNames: readonly string[];
  readonly missingMarkerCode: SpringDiscoveryDiagnosticCode;
  readonly missingMarkerMessage: string;
  readonly searchFailedCode: SpringDiscoveryDiagnosticCode;
  readonly searchFailedMessage: string;
  readonly additionalModuleRelativeUris?: (
    markerUris: readonly string[],
  ) => Promise<readonly string[]>;
}

function moduleRelativeUri(markerRelativeUri: string): string {
  const normalized = normalizeRelativeUri(markerRelativeUri);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "." : normalized.slice(0, separator);
}

function nearestModule(
  modules: readonly Omit<BuildModule, "sourceRoots">[],
  sourceRoot: string,
): Omit<BuildModule, "sourceRoots"> | undefined {
  return modules
    .filter((module) => relativeUriWithin(module.rootUri, sourceRoot) !== null)
    .sort((left, right) => right.rootUri.length - left.rootUri.length)[0];
}

async function findMarkers(
  fileSystem: ReadonlyWorkspaceFileSystem,
  request: WorkspaceDetectionRequest,
  workspaceUri: string,
  discovery: BuildModuleDiscovery,
  diagnostics: AnalysisDiagnostic[],
): Promise<readonly string[]> {
  try {
    const matches = await Promise.all(
      discovery.markerGlobs.map((includeGlob) =>
        fileSystem.findFiles({
          rootUri: workspaceUri,
          includeGlob,
          excludeGlobs: request.excludeGlobs,
        }),
      ),
    );
    return uniqueSorted(matches.flat());
  } catch (error) {
    diagnostics.push(
      discoveryDiagnostic(
        discovery.searchFailedCode,
        "error",
        discovery.searchFailedMessage,
        { error: errorMessage(error), rootUri: workspaceUri },
      ),
    );
    return [];
  }
}

export async function discoverBuildModules(
  fileSystem: ReadonlyWorkspaceFileSystem,
  request: WorkspaceDetectionRequest,
  workspaceUri: string,
  discovery: BuildModuleDiscovery,
  diagnostics: AnalysisDiagnostic[],
): Promise<readonly BuildModule[]> {
  const markerUris = await findMarkers(
    fileSystem,
    request,
    workspaceUri,
    discovery,
    diagnostics,
  );
  const markerNames = new Set(discovery.markerFileNames);
  const modulesByRoot = new Map<
    string,
    Omit<BuildModule, "sourceRoots">
  >();

  for (const markerUri of markerUris) {
    const markerRelativeUri = relativeUriWithin(workspaceUri, markerUri);
    const markerName = markerRelativeUri?.split("/").at(-1);
    if (
      markerRelativeUri === null ||
      markerRelativeUri === undefined ||
      markerName === undefined ||
      !markerNames.has(markerName)
    ) {
      continue;
    }
    const relativeUri = moduleRelativeUri(markerRelativeUri);
    const rootUri = resolveDirectoryUri(workspaceUri, relativeUri);
    modulesByRoot.set(rootUri, { relativeUri, rootUri });
  }

  const additionalModuleRelativeUris =
    await discovery.additionalModuleRelativeUris?.(markerUris) ?? [];
  for (const value of additionalModuleRelativeUris) {
    const relativeUri = normalizeRelativeUri(value);
    const rootUri = resolveDirectoryUri(workspaceUri, relativeUri);
    if (relativeUriWithin(workspaceUri, rootUri) === null) {
      continue;
    }
    modulesByRoot.set(rootUri, { relativeUri, rootUri });
  }

  const modules = [...modulesByRoot.values()].sort((left, right) =>
    left.relativeUri.localeCompare(right.relativeUri),
  );
  if (modules.length === 0) {
    if (diagnostics.length === 0) {
      diagnostics.push(
        discoveryDiagnostic(
          discovery.missingMarkerCode,
          "information",
          discovery.missingMarkerMessage,
          { rootUri: workspaceUri },
        ),
      );
    }
    return [];
  }

  if (request.sourceRoots.length === 0) {
    return modules.map((module) => ({
      ...module,
      sourceRoots: resolveSourceRoots(request, module.rootUri, diagnostics),
    }));
  }

  const configuredRoots = resolveSourceRoots(
    request,
    workspaceUri,
    diagnostics,
  );
  const rootsByModule = new Map<string, string[]>();
  for (const sourceRoot of configuredRoots) {
    const owner = nearestModule(modules, sourceRoot);
    if (owner === undefined) {
      continue;
    }
    const roots = rootsByModule.get(owner.rootUri) ?? [];
    roots.push(sourceRoot);
    rootsByModule.set(owner.rootUri, roots);
  }

  return modules.map((module) => ({
    ...module,
    sourceRoots: uniqueSorted(rootsByModule.get(module.rootUri) ?? []),
  }));
}
