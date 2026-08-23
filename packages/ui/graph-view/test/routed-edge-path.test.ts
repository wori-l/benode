import { describe, expect, it } from "vitest";

import {
  routedEdgeCenter,
  routedEdgePath,
} from "../src/layout/routed-edge-path.js";

describe("routedEdgePath", () => {
  it("preserves ELK bend points and rounds orthogonal corners", () => {
    expect(routedEdgePath([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
      { x: 50, y: 30 },
    ], 5)).toBe(
      "M 0 0 L 15 0 Q 20 0 20 5 L 20 25 Q 20 30 25 30 L 50 30",
    );
  });

  it("finds the midpoint along an orthogonal route", () => {
    expect(routedEdgeCenter([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
      { x: 50, y: 30 },
    ])).toEqual({ x: 20, y: 20 });
  });

  it("renders a straight section without introducing bends", () => {
    expect(routedEdgePath([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
    ])).toBe("M 10 20 L 40 20");
  });

  it("returns an empty path for an absent route", () => {
    expect(routedEdgePath([])).toBe("");
  });
});
