import { describe, expect, it, vi } from "vitest";
import { setPinnedImageFullscreenPreview } from "../../src/main/services/pinnedImagePreview";

const electronMock = vi.hoisted(() => ({
  getDisplayMatching: vi.fn(() => ({
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  })),
}));

vi.mock("electron", () => ({
  screen: {
    getDisplayMatching: electronMock.getDisplayMatching,
  },
}));

describe("pinned image fullscreen preview", () => {
  it("expands a pinned image window to the display work area and restores the previous bounds", () => {
    let bounds = { x: 120, y: 90, width: 420, height: 280 };
    const window = {
      getBounds: vi.fn(() => bounds),
      setBounds: vi.fn((nextBounds: typeof bounds) => {
        bounds = nextBounds;
      }),
    };

    expect(setPinnedImageFullscreenPreview(window, true)).toEqual({ previewing: true });
    expect(electronMock.getDisplayMatching).toHaveBeenCalledWith({ x: 120, y: 90, width: 420, height: 280 });
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1920, height: 1080 }, true);

    expect(setPinnedImageFullscreenPreview(window, false)).toEqual({ previewing: false });
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 120, y: 90, width: 420, height: 280 }, true);
  });
});