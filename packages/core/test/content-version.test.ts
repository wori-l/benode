import { describe, expect, it } from "vitest";

import { createContentVersion } from "../src/index.js";

describe("createContentVersion", () => {
  it("hashes only the source content", async () => {
    const version = await createContentVersion("same source");

    expect(version).toMatch(/^sha256:[0-9a-f]{64}$/u);
    await expect(createContentVersion("same source")).resolves.toBe(version);
    await expect(createContentVersion("changed source")).resolves.not.toBe(
      version,
    );
  });
});
