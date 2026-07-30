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

describe("preload pet skin API", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    electronMock.listeners.clear();
    await import("../../src/preload/index");
  });

  it("exposes pet skin controls through ipcRenderer", async () => {
    const api = electronMock.exposed as {
      pet: {
        getCurrentSkin(): Promise<unknown>;
        importSkinFolder(): Promise<unknown>;
        resetSkin(): Promise<unknown>;
        openPetdex(): Promise<unknown>;
        listPetdexPets(): Promise<unknown>;
        installPetdexSkin(slug: string): Promise<unknown>;
        listManagedSkins(): Promise<unknown>;
        useManagedSkin(slug: string): Promise<unknown>;
        deleteManagedSkin(slug: string): Promise<unknown>;
      };
    };

    await api.pet.getCurrentSkin();
    await api.pet.importSkinFolder();
    await api.pet.resetSkin();
    await api.pet.openPetdex();
    await api.pet.listPetdexPets();
    await api.pet.installPetdexSkin("boba");
    await api.pet.listManagedSkins();
    await api.pet.useManagedSkin("mint");
    await api.pet.deleteManagedSkin("mint");

    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(1, ipcChannels.petSkinGetCurrent);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(2, ipcChannels.petSkinImportFolder);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(3, ipcChannels.petSkinReset);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(4, ipcChannels.petSkinOpenPetdex);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(5, ipcChannels.petSkinListPetdex);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(6, ipcChannels.petSkinInstallPetdex, { slug: "boba" });
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(7, ipcChannels.petSkinListManaged);
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(8, ipcChannels.petSkinUseManaged, { slug: "mint" });
    expect(electronMock.ipcRenderer.invoke).toHaveBeenNthCalledWith(9, ipcChannels.petSkinDeleteManaged, { slug: "mint" });
  });

  it("subscribes to pet skin changes", () => {
    const api = electronMock.exposed as { pet: { onSkinChanged(callback: (result: unknown) => void): () => void } };
    const callback = vi.fn();
    const payload = { skin: { manifest: { displayName: "Mint" } } };

    const unsubscribe = api.pet.onSkinChanged(callback);
    electronMock.listeners.get(ipcChannels.petSkinChanged)?.({}, payload);
    unsubscribe();

    expect(callback).toHaveBeenCalledWith(payload);
    expect(electronMock.ipcRenderer.removeListener).toHaveBeenCalledWith(ipcChannels.petSkinChanged, expect.any(Function));
  });
});