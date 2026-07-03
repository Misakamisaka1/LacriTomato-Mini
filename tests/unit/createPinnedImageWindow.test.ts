import { describe, expect, it, vi } from "vitest";
import { createPinnedImageWindow } from "../../src/main/windows/createPinnedImageWindow";

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: unknown;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    loadFile: ReturnType<typeof vi.fn>;
  }> = [];

  const BrowserWindow = vi.fn((options: unknown) => {
    const window = {
      options,
      setAlwaysOnTop: vi.fn(),
      loadFile: vi.fn(),
    };
    instances.push(window);
    return window;
  });

  return { BrowserWindow, instances };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
}));

describe("createPinnedImageWindow", () => {
  it("creates a separate always-on-top window for each pinned capture", () => {
    const first = createPinnedImageWindow("preload.js", "capture-1");
    const second = createPinnedImageWindow("preload.js", "capture-2");

    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
    expect(electronMock.instances[0].setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(electronMock.instances[1].setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(electronMock.instances[0].loadFile).toHaveBeenCalledWith(expect.any(String), {
      query: { view: "pinned-image", captureId: "capture-1" },
    });
    expect(electronMock.instances[1].loadFile).toHaveBeenCalledWith(expect.any(String), {
      query: { view: "pinned-image", captureId: "capture-2" },
    });
  });
});
