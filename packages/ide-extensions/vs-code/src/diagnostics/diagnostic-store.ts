import {
  type AnalysisDiagnostic,
  type DiagnosticSeverity,
  type JsonObject,
} from "@benode/core";
import type { LogOutputChannel } from "vscode";

export const EXTENSION_DIAGNOSTIC_CODES = {
  analysisFailed: "BENODE_ANALYSIS_FAILED",
  endpointUnavailable: "BENODE_ENDPOINT_UNAVAILABLE",
  graphUnavailable: "BENODE_GRAPH_UNAVAILABLE",
  invalidWebviewMessage: "BENODE_WEBVIEW_INVALID_MESSAGE",
  navigationFailed: "BENODE_SOURCE_NAVIGATION_FAILED",
} as const;

function logDetails(details: JsonObject | undefined): readonly JsonObject[] {
  return details === undefined ? [] : [details];
}

function diagnosticKey(diagnostic: AnalysisDiagnostic): string {
  const location = diagnostic.sourceLocation;
  return [
    diagnostic.code,
    diagnostic.message,
    location?.uri ?? "",
    location?.start.line.toString() ?? "",
    location?.start.column.toString() ?? "",
  ].join("\u0000");
}

function uniqueDiagnostics(
  diagnostics: readonly AnalysisDiagnostic[],
): readonly AnalysisDiagnostic[] {
  const unique = new Map<string, AnalysisDiagnostic>();
  diagnostics.forEach((diagnostic) => {
    unique.set(diagnosticKey(diagnostic), diagnostic);
  });
  return [...unique.values()];
}

function logDiagnostic(
  output: LogOutputChannel,
  diagnostic: AnalysisDiagnostic,
): void {
  switch (diagnostic.severity) {
    case "error":
      output.error(diagnostic.message, diagnostic);
      return;
    case "information":
      output.info(diagnostic.message, diagnostic);
      return;
    case "warning":
      output.warn(diagnostic.message, diagnostic);
  }
}

export class DiagnosticStore {
  readonly #output: LogOutputChannel;
  #analysis: readonly AnalysisDiagnostic[] = [];
  #operational: readonly AnalysisDiagnostic[] = [];

  constructor(output: LogOutputChannel) {
    this.#output = output;
  }

  debug(message: string, details?: JsonObject): void {
    this.#output.debug(message, ...logDetails(details));
  }

  info(message: string, details?: JsonObject): void {
    this.#output.info(message, ...logDetails(details));
  }

  replaceAnalysis(diagnostics: readonly AnalysisDiagnostic[]): void {
    this.#analysis = uniqueDiagnostics(diagnostics);
    this.#analysis.forEach((diagnostic) => {
      logDiagnostic(this.#output, diagnostic);
    });
  }

  clearAnalysis(): void {
    this.#analysis = [];
  }

  report(
    code: string,
    message: string,
    severity: DiagnosticSeverity = "error",
    details?: JsonObject,
  ): AnalysisDiagnostic {
    const diagnostic: AnalysisDiagnostic = {
      code,
      severity,
      message,
      ...(details === undefined ? {} : { details }),
    };
    this.#operational = uniqueDiagnostics([
      ...this.#operational,
      diagnostic,
    ]);
    logDiagnostic(this.#output, diagnostic);
    return diagnostic;
  }

  diagnostics(): readonly AnalysisDiagnostic[] {
    return uniqueDiagnostics([...this.#analysis, ...this.#operational]);
  }

  show(): void {
    this.#output.show(true);
  }
}
