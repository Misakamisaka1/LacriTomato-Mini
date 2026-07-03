import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScreenshotTipWindow } from "../../src/main/windows/createScreenshotTipWindow";

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    loadFile: ReturnType<typeof vi.fn>;
    showInactive: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    emit(eventName: string): void;
  }> = [];

  const BrowserWindow = vi.fn((options: Record<string, unknown>) => {
    let destroyed = false;
    const listeners = new Map<string, Array<() => void>>();
    const window = {
      options,
      setAlwaysOnTop: vi.fn(),
      loadFile: vi.fn(),
      showInactive: vi.fn(),
      close: vi.fn(() => {
        destroyed = true;
        listeners.get("closed")?.forEach((listener) => listener());
      }),
      isDestroyed: vi.fn(() => destroyed),
      once: vi.fn((eventName: string, listener: () => void) => {
        listeners.set(eventName, [listener]);
        return window;
      }),
      on: vi.fn((eventName: string, listener: () => void) => {
        listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener]);
        return window;
      }),
      emit(eventName: string) {
        listeners.get(eventName)?.forEach((listener) => listener());
      },
    };
    instances.push(window);
    return window;
  });

  return {
    BrowserWindow,
    instances,
    screen: {
      getCursorScreenPoint: vi.fn(() => ({ x: 2500, y: 720 })),
      getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 1920, y: 0, width: 1280, height: 1024 } })),
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  screen: electronMock.screen,
}));

describe("createScreenshotTipWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electronMock.instances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a larger non-focus success tip near the center of the cursor display and closes it after two seconds", () => {
    const tipWindow = createScreenshotTipWindow("preload.js", "截图已复制到剪贴板", "renderer.html");
    const instance = electronMock.instances[0];

    expect(tipWindow).toBe(instance);
    expect(electronMock.screen.getDisplayNearestPoint).toHaveBeenCalledWith({ x: 2500, y: 720 });
    expect(electronMock.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      x: 2350,
      y: 392,
      width: 420,
      height: 80,
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      show: false,
      webPreferences: {
        preload: "preload.js",
        contextIsolation: true,
        nodeIntegration: false,
      },
    }));
    expect(instance.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(instance.loadFile).toHaveBeenCalledWith("renderer.html", {
      query: { view: "screenshot-tip", message: "截图已复制到剪贴板" },
    });

    expect(instance.showInactive).not.toHaveBeenCalled();
    instance.emit("ready-to-show");
    expect(instance.showInactive).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1999);
    expect(instance.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(instance.close).toHaveBeenCalledTimes(1);
  });
});
