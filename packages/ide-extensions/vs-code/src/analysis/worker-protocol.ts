import type {
  FileFacts,
  FrameworkBuildRequest,
  FrameworkIndex,
  IndexFileRequest,
} from "@benode/core";

interface WorkerRequestBase {
  readonly id: number;
}

export type AnalysisWorkerRequest =
  | (WorkerRequestBase & {
      readonly type: "initialize";
      readonly parserId: string;
      readonly parserAssetRoot: string;
    })
  | (WorkerRequestBase & {
      readonly type: "index";
      readonly requests: readonly IndexFileRequest[];
    })
  | (WorkerRequestBase & {
      readonly type: "build";
      readonly request: FrameworkBuildRequest;
      readonly excludedPackages: readonly string[] | undefined;
    });

export type AnalysisWorkerCommand =
  AnalysisWorkerRequest extends infer Request
    ? Request extends AnalysisWorkerRequest
      ? Omit<Request, "id">
      : never
    : never;

export type AnalysisWorkerResult =
  | { readonly type: "initialized" }
  | {
      readonly type: "indexed";
      readonly facts: readonly FileFacts[];
    }
  | {
      readonly type: "built";
      readonly index: FrameworkIndex;
    };

export interface AnalysisWorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: AnalysisWorkerResult;
  readonly error?: string;
}

export function isWorkerResponse(
  value: unknown,
): value is AnalysisWorkerResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<AnalysisWorkerResponse>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.ok === "boolean"
  );
}
