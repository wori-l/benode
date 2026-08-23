import {
  type AnalysisDiagnostic,
} from "@benode/core";

import type { SpringDiscoveryDiagnosticCode } from "./constants.js";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function discoveryDiagnostic(
  code: SpringDiscoveryDiagnosticCode,
  severity: AnalysisDiagnostic["severity"],
  message: string,
  details: AnalysisDiagnostic["details"] = {},
  uri?: string,
): AnalysisDiagnostic {
  return {
    code,
    severity,
    message,
    ...(uri === undefined
      ? {}
      : {
          sourceLocation: {
            uri,
            start: { line: 0, column: 0 },
            end: { line: 0, column: 0 },
          },
        }),
    details,
  };
}
