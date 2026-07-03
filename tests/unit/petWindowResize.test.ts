import { describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload: unknown) => unknown>();
  const petWindow = {
    getBounds: vi.fn(() => ({ x: 100, y: 200, width: 460, height: 360 })),
    setBounds: vi.fn(),
  };

  return {
    handlers,
    petWindow,
    screen: {
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 500, height: 400 } })),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => petWindow),
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  ipcMain: electronMock.ipcMain,
  screen: electronMock.screen,
}));

function createDeps() {
  return {
    configService: {
      getConfig: vi.fn(),
      setConfig: vi.fn(),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ settings: [] })),
    },
    invokePluginAction: vi.fn(),
  };
}

describe("pet window resize IPC", () => {
  it("keeps the pet anchored to the same bottom center while syncing the pet body size", () => {
    registerCoreIpc(createDeps() as never);

    const resize = electronMock.handlers.get(ipcChannels.petSyncBodySize);
    resize?.({ sender: {} }, { width: 120, height: 128 });

    expect(electronMock.petWindow.setBounds).toHaveBeenCalledWith({
      x: 270,
      y: 432,
      width: 120,
      height: 128,
    });
  });

  it("does not expose content resize for menus or bubbles", () => {
    registerCoreIpc(createDeps() as never);

    expect(electronMock.handlers.has(ipcChannels.petResizeToContent)).toBe(false);
  });
  it("chooses menu placement from the real pet window bounds", () => {
    registerCoreIpc(createDeps() as never);

    const choose = electronMock.handlers.get(ipcChannels.petChooseMenuPlacement);

    electronMock.petWindow.getBounds.mockReturnValue({ x: 150, y: 200, width: 207, height: 224 });
    expect(choose?.({ sender: {} }, { menuWidth: 204 })).toBe("top");

    electronMock.petWindow.getBounds.mockReturnValue({ x: 0, y: 200, width: 207, height: 224 });
    expect(choose?.({ sender: {} }, { menuWidth: 204 })).toBe("right");

    electronMock.petWindow.getBounds.mockReturnValue({ x: 430, y: 200, width: 207, height: 224 });
    expect(choose?.({ sender: {} }, { menuWidth: 204 })).toBe("left");
  });
});
