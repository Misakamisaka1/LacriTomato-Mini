import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => ({
  exposed: undefined as unknown,
  listeners: new Map<string, (...args: unknown[]) => void>(),
  contextBridge: {
    exposeInMainWorld: vi.fn((_name: string, api: unknown) => {
      electronMock.exposed = api;
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      electronMock.listeners.set(channel, listener);
    }),
    removeListener: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  contextBridge: electronMock.contextBridge,
  ipcRenderer: electronMock.ipcRenderer,
}));

describe("preload recording API", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    electronMock.listeners.clear();
    await import("../../src/preload/index");
  });

  it("exposes recording controls through ipcRenderer", async () => {
    const api = electronMock.exposed as { recording: { getState(): Promise<unknown>; start(): Promise<unknown>; stop(): Promise<unknown>; listAudioDevices(): Promise<unknown> } };

    await api.recording.getState();
    await api.recording.start();
    await api.recording.stop();
    await api.recording.listAudioDevices();

    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, ipcChannels.recordingStateGet);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(2, ipcChannels.recordingStart);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(3, ipcChannels.recordingStop);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(4, ipcChannels.recordingListAudioDevices);
  });

  it("subscribes to recording state changes", () => {
    const api = electronMock.exposed as { recording: { onStateChanged(callback: (state: unknown) => void): () => void } };
    const callback = vi.fn();

    const unsubscribe = api.recording.onStateChanged(callback);
    electronMock.listeners.get(ipcChannels.recordingStateChanged)?.({}, { status: "idle", warnings: [] });
    unsubscribe();

    expect(callback).toHaveBeenCalledWith({ status: "idle", warnings: [] });
    expect(electronMock.ipcRenderer.removeListener).toHaveBeenCalledWith(ipcChannels.recordingStateChanged, expect.any(Function));
  });

  it("exposes directory selection through ipcRenderer", async () => {
    const api = electronMock.exposed as { dialog: { selectDirectory(defaultPath?: string): Promise<unknown> } };

    await api.dialog.selectDirectory("D:/captures/screenshots");

    expect(electronMock.ipcRenderer.invoke).toHaveBeenCalledWith("core:dialog:select-directory", {
      defaultPath: "D:/captures/screenshots",
    });
  });
});