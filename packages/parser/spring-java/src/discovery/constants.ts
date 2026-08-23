export const SPRING_BOOT_APPLICATION =
  "org.springframework.boot.autoconfigure.SpringBootApplication";

export const SPRING_BOOT_APPLICATION_PACKAGE =
  "org.springframework.boot.autoconfigure";

export const COMPONENT_SCAN =
  "org.springframework.context.annotation.ComponentScan";

export const COMPONENT_SCAN_PACKAGE =
  "org.springframework.context.annotation";

export const DEFAULT_SOURCE_ROOT = "src/main/java";

export const GENERATED_SOURCE_GLOBS = [
  "**/generated/**",
  "**/generated-sources/**",
] as const;

export const SPRING_DISCOVERY_DIAGNOSTIC_CODES = {
  FILE_READ_FAILED: "spring.discovery.fileReadFailed",
  FILE_SEARCH_FAILED: "spring.discovery.fileSearchFailed",
  INVALID_SOURCE_ROOT: "spring.discovery.invalidSourceRoot",
  INVALID_WORKSPACE_URI: "spring.discovery.invalidWorkspaceUri",
  NO_APPLICATIONS: "spring.discovery.noApplications",
} as const;

export const MAVEN_DISCOVERY_DIAGNOSTIC_CODES = {
  FILE_READ_FAILED: SPRING_DISCOVERY_DIAGNOSTIC_CODES.FILE_READ_FAILED,
  FILE_SEARCH_FAILED: SPRING_DISCOVERY_DIAGNOSTIC_CODES.FILE_SEARCH_FAILED,
  INVALID_SOURCE_ROOT: SPRING_DISCOVERY_DIAGNOSTIC_CODES.INVALID_SOURCE_ROOT,
  INVALID_WORKSPACE_URI:
    SPRING_DISCOVERY_DIAGNOSTIC_CODES.INVALID_WORKSPACE_URI,
  MAVEN_POM_NOT_FOUND: "spring.discovery.mavenPomNotFound",
  NO_APPLICATIONS: SPRING_DISCOVERY_DIAGNOSTIC_CODES.NO_APPLICATIONS,
} as const;

export type MavenDiscoveryDiagnosticCode =
  (typeof MAVEN_DISCOVERY_DIAGNOSTIC_CODES)[keyof typeof MAVEN_DISCOVERY_DIAGNOSTIC_CODES];

export const GRADLE_DISCOVERY_DIAGNOSTIC_CODES = {
  ...MAVEN_DISCOVERY_DIAGNOSTIC_CODES,
  GRADLE_BUILD_NOT_FOUND: "spring.discovery.gradleBuildNotFound",
} as const;

export type GradleDiscoveryDiagnosticCode =
  (typeof GRADLE_DISCOVERY_DIAGNOSTIC_CODES)[keyof typeof GRADLE_DISCOVERY_DIAGNOSTIC_CODES];

export type SpringDiscoveryDiagnosticCode =
  | MavenDiscoveryDiagnosticCode
  | GradleDiscoveryDiagnosticCode;
