import {
  createSymbolIndex as createCoreSymbolIndex,
  type ApplicationDescriptor,
  type FileFacts,
  type FrameworkBuildRequest,
} from "@benode/core";

import { typeRole } from "./annotations.js";
import type { SymbolIndex } from "./types.js";

function applicationPackage(application: ApplicationDescriptor): string {
  const qualifiedName = application.entryPoint.qualifiedName;
  const separator = qualifiedName.lastIndexOf(".");
  return separator < 0 ? "" : qualifiedName.slice(0, separator);
}

function belongsToApplication(
  facts: FileFacts,
  application: ApplicationDescriptor,
): boolean {
  const namespaces = application.sourceNamespaces ?? [
    applicationPackage(application),
  ];
  return namespaces.some(
    (namespace) => namespace === "" ||
      facts.namespaceName === namespace ||
      facts.namespaceName?.startsWith(namespace + ".") === true,
  );
}

export function createSymbolIndex(
  request: FrameworkBuildRequest,
): SymbolIndex {
  return createCoreSymbolIndex(request, {
    typeRole,
    belongsToApplication,
  });
}
