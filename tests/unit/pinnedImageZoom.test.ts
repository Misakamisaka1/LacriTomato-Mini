import { describe, expect, it, vi } from "vitest";
import { togglePinnedImageZoom } from "../../src/main/services/pinnedImageZoom";

describe("pinned image zoom", () => {
  it("expands a pinned image window around its current center and restores it on the next toggle", () => {
    let bounds = { x: 100, y: 80, width: 420, height: 280 };
    const window = {
      getBounds: vi.fn(() => bounds),
      setBounds: vi.fn((nextBounds: typeof bounds) => {
        bounds = nextBounds;
      }),
    };

    expect(togglePinnedImageZoom(window)).toEqual({ zoomed: true });
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: -70, y: -40, width: 760, height: 520 }, true);

    expect(togglePinnedImageZoom(window)).toEqual({ zoomed: false });
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 80, width: 420, height: 280 }, true);
  });
});
