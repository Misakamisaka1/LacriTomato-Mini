import { describe, expect, it } from "vitest";
import { addAnnotation, undoAnnotation } from "../../src/plugins/screenshot/types";

describe("screenshot annotations", () => {
  it("adds and undoes annotations immutably", () => {
    const state = { annotations: [] };
    const next = addAnnotation(state, { type: "rect", x: 1, y: 2, w: 10, h: 20, color: "#ff0000" });
    expect(next.annotations).toHaveLength(1);
    expect(state.annotations).toHaveLength(0);
    expect(undoAnnotation(next).annotations).toHaveLength(0);
  });
});
