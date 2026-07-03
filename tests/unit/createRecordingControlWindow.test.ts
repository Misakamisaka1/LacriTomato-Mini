import { describe, expect, it, vi } from "vitest";
import { createRecordingControlWindow, toggleRecordingControlWindow } from "../../src/main/windows/createRecordingControlWindow";

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    loadFile: ReturnType<typeof vi.fn>;
    showInactive: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    emit(eventName: string): void;
  }> = [];

  const BrowserWindow = vi.fn((options: Record<string, unknown>) => {
    const listeners = new Map<string, Array<() => void>>();
    const window = {
      options,
      setAlwaysOnTop: vi.fn(),
      loadFile: vi.fn(),
      showInactive: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn((eventName: string, listener: () => void) => {
        listeners.set(eventName, [listener]);
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

describe("createRecordingControlWindow", () => {
  it("creates a compact always-on-top control strip at the top right of the cursor display", () => {
    const window = createRecordingControlWindow("preload.js", "renderer.html");
    const instance = electronMock.instances[0];

    expect(window).toBe(instance);
    expect(electronMock.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      x: 2942,
      y: 14,
      width: 244,
      height: 46,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      webPreferences: {
        preload: "preload.js",
        contextIsolation: true,
        nodeIntegration: false,
      },
    }));
    expect(instance.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(instance.loadFile).toHaveBeenCalledWith("renderer.html", { query: { view: "recording-control" } });

    instance.emit("ready-to-show");
    expect(instance.showInactive).toHaveBeenCalledTimes(1);
  });
});
function createToggleWindow(destroyed = false) {
  let closedListener: (() => void) | undefined;
  return {
    isDestroyed: vi.fn(() => destroyed),
    close: vi.fn(),
    on: vi.fn((eventName: "closed", listener: () => void) => {
      if (eventName === "closed") {
        closedListener = listener;
      }
    }),
    emitClosed() {
      closedListener?.();
    },
  };
}

describe("toggleRecordingControlWindow", () => {
  it("creates and tracks the toolbar when none is open", () => {
    const state: { current?: ReturnType<typeof createToggleWindow> } = {};
    const window = createToggleWindow();
    const createWindow = vi.fn(() => window);

    const result = toggleRecordingControlWindow(state, createWindow);

    expect(result).toBe(window);
    expect(state.current).toBe(window);
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(window.on).toHaveBeenCalledWith("closed", expect.any(Function));
  });

  it("closes and forgets the toolbar when one is already open", () => {
    const window = createToggleWindow();
    const state: { current?: ReturnType<typeof createToggleWindow> } = { current: window };
    const createWindow = vi.fn(() => createToggleWindow());

    const result = toggleRecordingControlWindow(state, createWindow);

    expect(result).toBeUndefined();
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(state.current).toBeUndefined();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it("creates a fresh toolbar when the tracked one has been destroyed", () => {
    const destroyedWindow = createToggleWindow(true);
    const nextWindow = createToggleWindow();
    const state: { current?: ReturnType<typeof createToggleWindow> } = { current: destroyedWindow };
    const createWindow = vi.fn(() => nextWindow);

    const result = toggleRecordingControlWindow(state, createWindow);

    expect(result).toBe(nextWindow);
    expect(destroyedWindow.close).not.toHaveBeenCalled();
    expect(state.current).toBe(nextWindow);
  });

  it("forgets the toolbar when the created window closes itself", () => {
    const state: { current?: ReturnType<typeof createToggleWindow> } = {};
    const window = createToggleWindow();

    toggleRecordingControlWindow(state, () => window);
    window.emitClosed();

    expect(state.current).toBeUndefined();
  });
});