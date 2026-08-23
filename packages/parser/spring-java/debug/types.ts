import type {
  FileFacts,
  FrameworkIndex,
  WorkspaceDetectionResult,
} from "@benode/core";

export interface ServiceDebugAnalysis {
  readonly servicePath: string;
  readonly discovery: WorkspaceDetectionResult;
  readonly fileFacts: readonly FileFacts[];
  readonly frameworkIndex: FrameworkIndex;
}
