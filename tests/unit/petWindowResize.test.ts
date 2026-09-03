import { describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload: unknown) => unknown>();
  const petWindow = {
    getBounds: vi.fn(() => ({ x: 100, y: 200, width: 460, height: 360 })),
    setBounds: vi.fn(),
    getPosition: vi.fn(() => [100, 200]),
    setPosition: vi.fn(),
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
    petWindow: electronMock.petWindow as never,
    petPositionService: { save: vi.fn() },
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

  it("moves the pet window with explicit bounds so dragging cannot inflate its size", () => {
    registerCoreIpc(createDeps() as never);

    const resize = electronMock.handlers.get(ipcChannels.petSyncBodySize);
    resize?.({ sender: {} }, { width: 207, height: 224 });
    electronMock.petWindow.setBounds.mockClear();

    const move = electronMock.handlers.get(ipcChannels.petMoveBy);
    move?.({ sender: {} }, { deltaX: 16, deltaY: 24 });

    expect(electronMock.petWindow.setPosition).not.toHaveBeenCalled();
    expect(electronMock.petWindow.setBounds).toHaveBeenCalledWith({
      x: 116,
      y: 224,
      width: 207,
      height: 224,
    });
  });

  it("falls back to moving by position before the pet body size is synced", () => {
    registerCoreIpc(createDeps() as never);

    const move = electronMock.handlers.get(ipcChannels.petMoveBy);
    move?.({ sender: {} }, { deltaX: 16, deltaY: 24 });

    expect(electronMock.petWindow.setPosition).toHaveBeenCalledWith(116, 224);
  });

  it("persists the pet window bottom-center anchor when the drag ends", () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);
    electronMock.petWindow.getBounds.mockReturnValue({ x: 100, y: 200, width: 460, height: 360 });

    const save = electronMock.handlers.get(ipcChannels.petSavePosition);
    save?.({ sender: {} }, undefined);

    expect(deps.petPositionService.save).toHaveBeenCalledWith({ x: 330, y: 560 });
  });

  it("ignores position saves from non-pet windows", () => {
    const deps = createDeps();
    deps.petWindow = { other: true } as never;
    registerCoreIpc(deps as never);

    const save = electronMock.handlers.get(ipcChannels.petSavePosition);
    save?.({ sender: {} }, undefined);

    expect(deps.petPositionService.save).not.toHaveBeenCalled();
  });
});
