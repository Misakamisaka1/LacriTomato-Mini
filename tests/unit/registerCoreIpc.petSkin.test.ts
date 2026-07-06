import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { ipcChannels } from "../../src/shared/ipcChannels";

const skinResult = {
  skin: {
    manifest: {
      id: "mint",
      displayName: "Mint",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///D:/pets/mint/spritesheet.webp",
    sourcePath: "D:/pets/mint",
    source: "local",
  },
  fallbackUsed: false,
};

const bundledResult = {
  skin: {
    manifest: {
      id: "lacritomato-mini",
      displayName: "LacriTomato Mini",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///assets/pet/spritesheet.webp",
    source: "bundled",
  },
  fallbackUsed: false,
};

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload?: unknown) => unknown>();
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const sourceWindow = { webContents: { send: vi.fn() } };

  return {
    handlers,
    sent,
    sourceWindow,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    dialog: {
      showOpenDialog: vi.fn(),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => sourceWindow),
      getAllWindows: vi.fn(() => [{
        webContents: {
          send: vi.fn((channel: string, payload: unknown) => sent.push({ channel, payload })),
        },
      }]),
    },
    screen: {
      getAllDisplays: vi.fn(() => []),
      getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } })),
      getDisplayNearestPoint: vi.fn(() => ({ id: 1 })),
      getPrimaryDisplay: vi.fn(() => ({ id: 1, bounds: { x: 0, y: 0, width: 800, height: 600 } })),
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
  const nextConfig = {
    ...defaultAppConfig,
    pet: { ...defaultAppConfig.pet, skinSourcePath: "D:/pets/mint" },
  };

  return {
    petSkinService: {
      getCurrentSkin: vi.fn(() => bundledResult),
      importSkinFolder: vi.fn(() => skinResult),
      resetSkin: vi.fn(() => bundledResult),
      openPetdex: vi.fn(async () => undefined),
    },
    configService: {
      getConfig: vi.fn(() => defaultAppConfig),
      setConfig: vi.fn(() => nextConfig),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] })),
    },
    invokePluginAction: vi.fn(),
    onConfigChanged: vi.fn(),
  };
}

describe("pet skin IPC", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.sent.length = 0;
    vi.clearAllMocks();
  });

  it("registers and returns the current skin", () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    expect(ipcChannels.petSkinGetCurrent).toBe("pet:skin:get-current");
    expect(electronMock.handlers.get(ipcChannels.petSkinGetCurrent)?.({ sender: {} })).toEqual(bundledResult);
    expect(deps.petSkinService.getCurrentSkin).toHaveBeenCalledTimes(1);
  });

  it("imports a selected skin folder, persists it, and broadcasts the result", async () => {
    electronMock.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["D:/pets/mint"] });
    const deps = createDeps();
    registerCoreIpc(deps as never);

    await expect(electronMock.handlers.get(ipcChannels.petSkinImportFolder)?.({ sender: {} })).resolves.toEqual(skinResult);

    expect(electronMock.dialog.showOpenDialog).toHaveBeenCalledWith(electronMock.sourceWindow, {
      title: "选择宠物皮肤文件夹",
      properties: ["openDirectory"],
    });
    expect(deps.petSkinService.importSkinFolder).toHaveBeenCalledWith("D:/pets/mint");
    expect(deps.configService.setConfig).toHaveBeenCalledWith({ pet: { skinSourcePath: "D:/pets/mint" } });
    expect(deps.onConfigChanged).toHaveBeenCalledWith(expect.objectContaining({ pet: expect.objectContaining({ skinSourcePath: "D:/pets/mint" }) }));
    expect(electronMock.sent).toEqual([{ channel: ipcChannels.petSkinChanged, payload: skinResult }]);
  });

  it("does not import when folder selection is canceled", async () => {
    electronMock.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const deps = createDeps();
    registerCoreIpc(deps as never);

    await expect(electronMock.handlers.get(ipcChannels.petSkinImportFolder)?.({ sender: {} })).resolves.toBeUndefined();

    expect(deps.petSkinService.importSkinFolder).not.toHaveBeenCalled();
    expect(deps.configService.setConfig).not.toHaveBeenCalled();
    expect(electronMock.sent).toEqual([]);
  });

  it("resets the active skin and opens Petdex", async () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    await expect(electronMock.handlers.get(ipcChannels.petSkinReset)?.({ sender: {} })).resolves.toEqual(bundledResult);
    await expect(electronMock.handlers.get(ipcChannels.petSkinOpenPetdex)?.({ sender: {} })).resolves.toBeUndefined();

    expect(deps.petSkinService.resetSkin).toHaveBeenCalledTimes(1);
    expect(deps.configService.setConfig).toHaveBeenCalledWith({ pet: { skinSourcePath: "" } });
    expect(deps.petSkinService.openPetdex).toHaveBeenCalledTimes(1);
    expect(electronMock.sent).toEqual([{ channel: ipcChannels.petSkinChanged, payload: bundledResult }]);
  });
});