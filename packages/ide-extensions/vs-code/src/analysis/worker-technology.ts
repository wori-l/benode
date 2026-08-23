import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  SpringBootFrameworkAdapter,
  SPRING_JAVA_WORKSPACE_PROFILE,
  TreeSitterJavaAdapter,
} from "@benode/spring-java";

import type { TechnologyWorkerRuntime } from "./technology-analysis.js";

async function createSpringRuntime(
  assetRoot: string,
): Promise<TechnologyWorkerRuntime> {
  const [declarationsQuery, invocationsQuery] = await Promise.all([
    readFile(resolve(assetRoot, "declarations.scm"), "utf8"),
    readFile(resolve(assetRoot, "invocations.scm"), "utf8"),
  ]);
  const languageAdapter = await TreeSitterJavaAdapter.create({
    runtimeWasmPath: resolve(assetRoot, "tree-sitter.wasm"),
    javaLanguageWasmPath: resolve(assetRoot, "tree-sitter-java.wasm"),
    declarationsQuery,
    invocationsQuery,
  });
  return {
    indexFile: (request) => languageAdapter.indexFile(request),
    buildIndex: (request, excludedPackages) =>
      new SpringBootFrameworkAdapter(excludedPackages).buildIndex(request),
    dispose: () => languageAdapter.dispose(),
  };
}

export async function createTechnologyWorkerRuntime(
  parserId: string,
  assetRoot: string,
): Promise<TechnologyWorkerRuntime> {
  if (parserId === SPRING_JAVA_WORKSPACE_PROFILE.parserId) {
    return createSpringRuntime(assetRoot);
  }
  throw new Error("Unknown parser: " + parserId);
}
