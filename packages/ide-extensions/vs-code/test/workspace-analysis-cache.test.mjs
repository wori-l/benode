import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  bytes: new Uint8Array(),
  calls: [],
}));

vi.mock("vscode", () => ({
  Uri: {
    joinPath(base, ...parts) {
      return { path: [base.path, ...parts].join("/") };
    },
  },
  workspace: {
    fs: {
      async createDirectory(uri) {
        state.calls.push(["createDirectory", uri.path]);
      },
      async delete(uri, options) {
        state.calls.push(["delete", uri.path, options]);
      },
      async readFile() {
        return state.bytes;
      },
      async rename(source, target) {
        state.calls.push(["rename", source.path, target.path]);
      },
      async writeFile(uri, bytes) {
        state.bytes = bytes;
        state.calls.push(["writeFile", uri.path, bytes.length]);
      },
    },
  },
}));

import { WorkspaceAnalysisCache } from "../src/analysis/workspace-analysis-cache.js";

beforeEach(() => {
  state.bytes = new Uint8Array();
  state.calls.length = 0;
});

test("a corrupt persisted manifest is discarded as a safe cache miss", async () => {
  state.bytes = new globalThis.TextEncoder().encode("{not-json");
  const cache = new WorkspaceAnalysisCache({ path: "/storage" }, "0.1.0");
  await expect(cache.load()).resolves.toBeUndefined();
  expect(state.calls).toContainEqual([
    "delete",
    "/storage/analysis-cache",
    { recursive: true, useTrash: false },
  ]);
});

test("a manifest from another extension version is discarded", async () => {
  state.bytes = new globalThis.TextEncoder().encode(JSON.stringify({
    extensionVersion: "0.0.9",
    state: {
      parserId: "spring-java",
      requestFingerprint: "old",
      discovery: { applications: [], diagnostics: [] },
      files: [],
    },
  }));
  const cache = new WorkspaceAnalysisCache({ path: "/storage" }, "0.1.0");
  await expect(cache.load()).resolves.toBeUndefined();
  expect(state.calls).toContainEqual([
    "delete",
    "/storage/analysis-cache",
    { recursive: true, useTrash: false },
  ]);
});

test("save publishes a complete manifest through atomic rename", async () => {
  const cache = new WorkspaceAnalysisCache({ path: "/storage" }, "0.1.0");
  await cache.save({
    parserId: "spring-java",
    requestFingerprint: "workspace",
    discovery: {
      applications: [],
      diagnostics: [],
    },
    files: [],
  });

  expect(state.calls.map((call) => call[0])).toEqual([
    "createDirectory",
    "writeFile",
    "rename",
  ]);
  expect(state.calls[1]?.[1]).toBe(
    "/storage/analysis-cache/workspace-state.json.tmp",
  );
  expect(JSON.parse(new globalThis.TextDecoder().decode(state.bytes)))
    .toMatchObject({ extensionVersion: "0.1.0" });
  expect(state.calls[2]).toEqual([
    "rename",
    "/storage/analysis-cache/workspace-state.json.tmp",
    "/storage/analysis-cache/workspace-state.json",
  ]);
});

test("clear removes the complete cache directory recursively", async () => {
  const cache = new WorkspaceAnalysisCache({ path: "/storage" }, "0.1.0");

  await cache.clear();

  expect(state.calls).toContainEqual([
    "delete",
    "/storage/analysis-cache",
    { recursive: true, useTrash: false },
  ]);
});
