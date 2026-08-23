import {
  type WorkspaceAnalysisProfile,
} from "@benode/core";

import { GENERATED_SOURCE_GLOBS } from "../discovery/constants.js";

export const SPRING_JAVA_WATCH_GLOBS = [
  "**/*.java",
  "**/{pom.xml,*.gradle,*.gradle.kts}",
] as const;

export const SPRING_JAVA_WORKSPACE_PROFILE: WorkspaceAnalysisProfile = {
  parserId: "spring-java",
  sourceFileGlob: "**/*.java",
  generatedSourceGlobs: GENERATED_SOURCE_GLOBS,
  isSourceFile: (uri) => uri.endsWith(".java"),
  isDiscoveryCandidate: (content) =>
    content.includes("SpringBootApplication"),
  isDiscoveryDescriptor: (uri) =>
    uri.endsWith("/pom.xml") ||
    uri.endsWith(".gradle") ||
    uri.endsWith(".gradle.kts"),
};
