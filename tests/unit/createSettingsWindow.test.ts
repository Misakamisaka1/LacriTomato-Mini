import { describe, expect, it, vi } from "vitest";
import { createSettingsWindow } from "../../src/main/windows/createSettingsWindow";

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: {
      autoHideMenuBar?: boolean;
      width?: number;
      height?: number;
    };
    loadFile: ReturnType<typeof vi.fn>;
    setMenu: ReturnType<typeof vi.fn>;
  }> = [];

  const BrowserWindow = vi.fn((options: typeof instances[number]["options"]) => {
    const window = {
      options,
      loadFile: vi.fn(),
      setMenu: vi.fn(),
    };
    instances.push(window);
    return window;
  });

  return { BrowserWindow, instances };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
}));

describe("createSettingsWindow", () => {
  it("hides the native application menu bar from the settings window", () => {
    createSettingsWindow("preload.js");

    expect(electronMock.instances[0].options.autoHideMenuBar).toBe(true);
    expect(electronMock.instances[0].setMenu).toHaveBeenCalledWith(null);
  });
});
