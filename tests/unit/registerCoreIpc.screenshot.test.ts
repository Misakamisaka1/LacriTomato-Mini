import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload?: unknown) => unknown>();
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 } },
  ];
  const virtualBounds = { x: 0, y: 0, width: 3200, height: 1080 };
  const overlayWindow = {
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1920, height: 1080 })),
    setBounds: vi.fn(),
  };

  return {
    handlers,
    overlayWindow,
    virtualBounds,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    dialog: {
      showOpenDialog: vi.fn(),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => overlayWindow),
    },
    screen: {
      getAllDisplays: vi.fn(() => displays),
      getCursorScreenPoint: vi.fn(() => ({ x: 2020, y: 140 })),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } })),
      getDisplayNearestPoint: vi.fn(() => displays[1]),
      getPrimaryDisplay: vi.fn(() => displays[0]),
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  dialog: electronMock.dialog,
  ipcMain: electronMock.ipcMain,
  screen: electronMock.screen,
}));

function createDeps() {
  return {
    configService: {
      getConfig: vi.fn(() => defaultAppConfig),
      setConfig: vi.fn(),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] })),
    },
    invokePluginAction: vi.fn(),
    showScreenshotTip: vi.fn(),
  };
}

describe("screenshot IPC", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    vi.clearAllMocks();
  });

  it("opens a separate screenshot success tip", () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    electronMock.handlers.get(ipcChannels.screenshotShowTip)?.({ sender: {} }, "截图已复制到剪贴板");

    expect(deps.showScreenshotTip).toHaveBeenCalledWith("截图已复制到剪贴板");
  });
  it("keeps the overlay on the virtual desktop and returns virtual coordinates", () => {
    registerCoreIpc(createDeps() as never);

    const result = electronMock.handlers.get(ipcChannels.screenshotGetCursorPoint)?.({ sender: {} });

    expect(electronMock.screen.getDisplayNearestPoint).toHaveBeenCalledWith({ x: 2020, y: 140 });
    expect(electronMock.overlayWindow.setBounds).toHaveBeenCalledWith(electronMock.virtualBounds);
    expect(result).toEqual({
      x: 2020,
      y: 140,
      displayChanged: false,
      displayId: 2,
      displaySize: { width: 3200, height: 1080 },
    });
  });

  it("returns the selected directory from the native folder picker", async () => {
    electronMock.dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["D:/captures/screenshots"],
    });
    registerCoreIpc(createDeps() as never);

    await expect(electronMock.handlers.get("core:dialog:select-directory")?.(
      { sender: {} },
      { defaultPath: "C:/initial" },
    )).resolves.toBe("D:/captures/screenshots");
    expect(electronMock.dialog.showOpenDialog).toHaveBeenCalledWith(electronMock.overlayWindow, {
      title: "\u9009\u62e9\u4fdd\u5b58\u6587\u4ef6\u5939",
      defaultPath: "C:/initial",
      properties: ["openDirectory", "createDirectory"],
    });
  });
});
