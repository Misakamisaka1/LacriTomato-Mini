import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload?: unknown) => unknown>();
  const sent: Array<{ channel: string; payload: unknown }> = [];

  return {
    handlers,
    sent,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => undefined),
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
  ipcMain: electronMock.ipcMain,
  screen: electronMock.screen,
}));

function createDeps() {
  const state = { status: "idle" as const, warnings: [] };
  let stateChanged: ((nextState: typeof state) => void) | undefined;

  return {
    recordingService: {
      getState: vi.fn(() => state),
      start: vi.fn(async () => ({ state: { status: "recording", warnings: [], outputPath: "C:/tmp/a.mp4" } })),
      stop: vi.fn(async () => ({ state, outputPath: "C:/tmp/a.mp4", warnings: [] })),
      listAudioDevices: vi.fn(async () => [{ id: "default", name: "默认麦克风", default: true }]),
      onStateChanged: vi.fn((callback: (nextState: typeof state) => void) => {
        stateChanged = callback;
        return vi.fn();
      }),
      emitStateChanged(nextState: typeof state) {
        stateChanged?.(nextState);
      },
    },
    configService: {
      getConfig: vi.fn(() => defaultAppConfig),
      setConfig: vi.fn(),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] })),
    },
    invokePluginAction: vi.fn(),
  };
}

describe("recording IPC", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.sent.length = 0;
    vi.clearAllMocks();
  });

  it("exposes recording state, start, stop, and audio devices", async () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    expect(electronMock.handlers.get(ipcChannels.recordingStateGet)?.({ sender: {} })).toEqual({ status: "idle", warnings: [] });
    await expect(electronMock.handlers.get(ipcChannels.recordingStart)?.({ sender: {} })).resolves.toEqual({ state: { status: "recording", warnings: [], outputPath: "C:/tmp/a.mp4" } });
    await expect(electronMock.handlers.get(ipcChannels.recordingStop)?.({ sender: {} })).resolves.toEqual({ state: { status: "idle", warnings: [] }, outputPath: "C:/tmp/a.mp4", warnings: [] });
    await expect(electronMock.handlers.get(ipcChannels.recordingListAudioDevices)?.({ sender: {} })).resolves.toEqual([{ id: "default", name: "默认麦克风", default: true }]);

    expect(deps.recordingService.start).toHaveBeenCalledWith(defaultAppConfig.recording);
    expect(deps.recordingService.stop).toHaveBeenCalledTimes(1);
  });


  it("uses application-level recording start and stop hooks when available", async () => {
    const deps = createDeps();
    const startRecording = vi.fn(async () => ({ state: { status: "recording" as const, warnings: [], outputPath: "C:/tmp/hooked.mp4" } }));
    const stopRecording = vi.fn(async () => ({ state: { status: "idle" as const, warnings: [] }, outputPath: "C:/tmp/hooked.mp4", warnings: [] }));
    registerCoreIpc({ ...deps, startRecording, stopRecording } as never);

    await expect(electronMock.handlers.get(ipcChannels.recordingStart)?.({ sender: {} })).resolves.toEqual({ state: { status: "recording", warnings: [], outputPath: "C:/tmp/hooked.mp4" } });
    await expect(electronMock.handlers.get(ipcChannels.recordingStop)?.({ sender: {} })).resolves.toEqual({ state: { status: "idle", warnings: [] }, outputPath: "C:/tmp/hooked.mp4", warnings: [] });

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(deps.recordingService.start).not.toHaveBeenCalled();
    expect(deps.recordingService.stop).not.toHaveBeenCalled();
  });
  it("broadcasts recording state changes to windows", () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    deps.recordingService.emitStateChanged({ status: "idle", warnings: [] });

    expect(electronMock.sent).toEqual([{ channel: ipcChannels.recordingStateChanged, payload: { status: "idle", warnings: [] } }]);
  });
});