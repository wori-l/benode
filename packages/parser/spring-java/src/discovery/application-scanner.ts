import {
  createStableApplicationId,
  relativeUriWithin,
  type AnalysisDiagnostic,
  type ApplicationDescriptor,
  type LanguageAdapter,
  type ReadonlyWorkspaceFileSystem,
} from "@benode/core";

import {
  SPRING_DISCOVERY_DIAGNOSTIC_CODES,
} from "./constants.js";
import {
  discoveryDiagnostic,
  errorMessage,
} from "./diagnostics.js";
import {
  applicationSourceNamespaces,
  isSpringBootApplicationType,
} from "./application-detection.js";

interface ApplicationScanInput {
  readonly fileSystem: ReadonlyWorkspaceFileSystem;
  readonly languageAdapter: LanguageAdapter;
  readonly workspaceUri: string;
  readonly moduleRelativeUri: string;
  readonly moduleRootUri: string;
  readonly sourceRoots: readonly string[];
  readonly javaUris: readonly string[];
  readonly diagnostics: AnalysisDiagnostic[];
}

export async function scanApplications(
  input: ApplicationScanInput,
): Promise<readonly ApplicationDescriptor[]> {
  const applications: ApplicationDescriptor[] = [];

  for (const uri of input.javaUris) {
    const relativeUri = relativeUriWithin(input.workspaceUri, uri);
    if (relativeUri === null) {
      input.diagnostics.push(
        discoveryDiagnostic(
          SPRING_DISCOVERY_DIAGNOSTIC_CODES.INVALID_SOURCE_ROOT,
          "warning",
          "A discovered Java file is outside the workspace.",
          { uri },
          uri,
        ),
      );
      continue;
    }

    let content: string;
    try {
      content = await input.fileSystem.readTextFile(uri);
    } catch (error) {
      input.diagnostics.push(
        discoveryDiagnostic(
          SPRING_DISCOVERY_DIAGNOSTIC_CODES.FILE_READ_FAILED,
          "warning",
          "A Java source file could not be read during discovery.",
          { error: errorMessage(error) },
          uri,
        ),
      );
      continue;
    }
    if (!content.includes("SpringBootApplication")) {
      continue;
    }

    try {
      const facts = await input.languageAdapter.indexFile({
        applicationId: uri,
        uri,
        relativeUri,
        content,
        contentVersion: "discovery",
      });
      input.diagnostics.push(...facts.diagnostics);
      for (const symbol of facts.symbols) {
        if (isSpringBootApplicationType(symbol, facts)) {
          applications.push({
            id: createStableApplicationId({
              moduleRelativeUri: input.moduleRelativeUri,
              entryPointQualifiedName:
                symbol.symbol.qualifiedName,
            }),
            name: symbol.symbol.name,
            rootUri: input.moduleRootUri,
            sourceRoots: input.sourceRoots,
            sourceNamespaces: applicationSourceNamespaces(symbol, facts),
            entryPoint: symbol.symbol,
            sourceLocation: symbol.sourceLocation,
          });
        }
      }
    } catch (error) {
      input.diagnostics.push(
        discoveryDiagnostic(
          SPRING_DISCOVERY_DIAGNOSTIC_CODES.FILE_READ_FAILED,
          "warning",
          "A Java source file could not be parsed during discovery.",
          { error: errorMessage(error) },
          uri,
        ),
      );
    }
  }

  return applications.sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
