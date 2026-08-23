import {
  type AnalysisDiagnostic,
} from "@benode/core";
import type { LogOutputChannel } from "vscode";
import { expect, test, vi } from "vitest";

import { DiagnosticStore } from "../src/diagnostics/diagnostic-store.js";

test("uses the log channel's native diagnostic levels", () => {
  const output = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    warn: vi.fn(),
  };
  const store = new DiagnosticStore(
    output as unknown as LogOutputChannel,
  );
  const diagnostics: readonly AnalysisDiagnostic[] = [
    {
      code: "test.information",
      severity: "information",
      message: "Information message",
    },
    {
      code: "test.warning",
      severity: "warning",
      message: "Warning message",
    },
  ];

  store.replaceAnalysis(diagnostics);
  store.debug("Progress", { phase: "indexing" });
  store.info("Analysis completed", { files: 2 });
  const error = store.report("test.error", "Error message");
  store.show();

  expect(output.info).toHaveBeenCalledWith(
    diagnostics[0]?.message,
    diagnostics[0],
  );
  expect(output.warn).toHaveBeenCalledWith(
    diagnostics[1]?.message,
    diagnostics[1],
  );
  expect(output.error).toHaveBeenCalledWith(error.message, error);
  expect(output.debug).toHaveBeenCalledWith(
    "Progress",
    { phase: "indexing" },
  );
  expect(output.info).toHaveBeenCalledWith(
    "Analysis completed",
    { files: 2 },
  );
  expect(output.show).toHaveBeenCalledWith(true);
});
