import { pathToFileURL } from "node:url";

import { SpringWorkspaceAnalyzer } from "../src/index.js";
import { NodeWorkspaceFileSystem } from "./node-workspace-file-system.js";
import { createDebugLanguageAdapter } from "./parser-resources.js";
import type { ServiceDebugAnalysis } from "./types.js";

export async function analyzeService(
  servicePath: string,
): Promise<ServiceDebugAnalysis> {
  const languageAdapter = await createDebugLanguageAdapter();

  try {
    const analysis = await new SpringWorkspaceAnalyzer({
      fileSystem: new NodeWorkspaceFileSystem(),
      languageAdapter,
    }).analyze({
      workspaceUri: pathToFileURL(servicePath).toString(),
      sourceRoots: [],
      excludeGlobs: [],
      includeGeneratedSources: false,
    });

    return {
      servicePath,
      ...analysis,
    };
  } finally {
    languageAdapter.dispose();
  }
}
