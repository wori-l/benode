import { afterEach, expect, test, vi } from "vitest";

import { WorkspaceChangeScheduler } from "../src/analysis/workspace-change-scheduler.js";

afterEach(() => {
  vi.useRealTimers();
});

test("watcher changes are debounced, deduplicated, and sorted", () => {
  vi.useFakeTimers();
  const onChanges = vi.fn();
  const scheduler = new WorkspaceChangeScheduler(150, onChanges);

  scheduler.record("file:///b.java", false);
  scheduler.record("file:///a.java", false);
  scheduler.record("file:///b.java", true);
  vi.advanceTimersByTime(149);
  expect(onChanges).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);

  expect(onChanges).toHaveBeenCalledWith({
    createdOrChangedUris: ["file:///a.java"],
    deletedUris: ["file:///b.java"],
  });
});

test("clear cancels a pending watcher update", () => {
  vi.useFakeTimers();
  const onChanges = vi.fn();
  const scheduler = new WorkspaceChangeScheduler(150, onChanges);

  scheduler.record("file:///changed.java", false);
  scheduler.clear();
  vi.runAllTimers();

  expect(onChanges).not.toHaveBeenCalled();
});
