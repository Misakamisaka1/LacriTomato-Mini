import { afterEach, describe, expect, it, vi } from "vitest";
import { createPetWindow } from "../../src/main/windows/createPetWindow";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const windowHandlers = new Map<string, (event: { preventDefault(): void }) => void>();
  const webContentsHandlers = new Map<string, (event: { preventDefault(): void }) => void>();
  const petWindow = {
    loadFile: vi.fn(),
    on: vi.fn((eventName: string, handler: (event: { preventDefault(): void }) => void) => {
      windowHandlers.set(eventName, handler);
    }),
    setAlwaysOnTop: vi.fn(),
    webContents: {
      on: vi.fn((eventName: string, handler: (event: { preventDefault(): void }) => void) => {
        webContentsHandlers.set(eventName, handler);
      }),
      send: vi.fn(),
    },
  };

  return {
    BrowserWindow: vi.fn(() => petWindow),
    petWindow,
    webContentsHandlers,
    windowHandlers,
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
}));

describe("createPetWindow", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    electronMock.windowHandlers.clear();
    electronMock.webContentsHandlers.clear();
  });

  it("deduplicates native and web context-menu events from one right click", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    createPetWindow("preload.js");

    const event = { preventDefault: vi.fn() };
    electronMock.windowHandlers.get("system-context-menu")?.(event);
    electronMock.webContentsHandlers.get("context-menu")?.(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(electronMock.petWindow.webContents.send).toHaveBeenCalledTimes(1);
    expect(electronMock.petWindow.webContents.send).toHaveBeenCalledWith(ipcChannels.petOpenMenu);
  });

  it("loads the renderer entry supplied by the main process for packaged installs", () => {
    const rendererIndexPath = "C:\\Program Files\\LacriTomato Mini\\resources\\app.asar\\dist\\renderer\\index.html";

    createPetWindow("preload.js", undefined, rendererIndexPath);

    expect(electronMock.petWindow.loadFile).toHaveBeenCalledWith(rendererIndexPath, {
      query: { view: "pet" },
    });
  });
});


