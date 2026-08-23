import { expect, test, vi } from "vitest";

const testState = vi.hoisted(() => ({
  calls: [],
  releaseSave: undefined,
}));

vi.mock("../src/analysis/workspace-analysis-cache.js", () => ({
  WorkspaceAnalysisCache: class {
    async clear() {
      testState.calls.push("clear");
    }

    async load() {
      testState.calls.push("load");
      return undefined;
    }

    async save() {
      testState.calls.push("save:start");
      await new Promise((resolve) => {
        testState.releaseSave = resolve;
      });
      testState.calls.push("save:end");
    }
  },
}));

import { CachedWorkspaceAnalysisState } from "../src/analysis/cached-workspace-analysis-state.js";

test("clear waits for older saves and prevents the cleared state from reloading", async () => {
  const store = new CachedWorkspaceAnalysisState(undefined, "0.1.0", vi.fn());
  store.publish({
    parserId: "spring-java",
    requestFingerprint: "old",
    discovery: { applications: [], diagnostics: [] },
    files: [],
  });
  const clearing = store.clear();

  await vi.waitFor(() => {
    expect(testState.calls).toEqual(["save:start"]);
  });
  testState.releaseSave();
  await clearing;

  expect(testState.calls).toEqual(["save:start", "save:end", "clear"]);
  await expect(store.previous()).resolves.toBeUndefined();
  expect(testState.calls).not.toContain("load");
});
