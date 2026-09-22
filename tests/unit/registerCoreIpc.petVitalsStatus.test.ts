import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { ipcChannels } from "../../src/shared/ipcChannels";
import { petVitalsPanelSizes } from "../../src/shared/petVitals";

const workArea = { x: 0, y: 0, width: 800, height: 600 };
const petBounds = { x: 100, y: 200, width: 200, height: 224 };
// Where the automatic layout parks the compact card next to that pet's head.
const autoBounds = { x: petBounds.x + petBounds.width + 8, y: 182, width: 240, height: 162 };

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  setBounds: ReturnType<typeof vi.fn>;
  getBounds(): { x: number; y: number; width: number; height: number };
  hide: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  showInactive: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  isVisible(): boolean;
  isDestroyed(): boolean;
  on: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  emit(event: string): void;
}

function createFakeWindow(initialBounds: { x: number; y: number; width: number; height: number }): FakeWindow {
  let bounds = { ...initialBounds };
  let visible = false;
  const listeners = new Map<string, Array<() => void>>();

  return {
    webContents: { send: vi.fn() },
    setBounds: vi.fn((next: Partial<typeof bounds>) => {
      bounds = { ...bounds, ...next };
    }),
    getBounds: () => ({ ...bounds }),
    hide: vi.fn(() => {
      visible = false;
    }),
    show: vi.fn(() => {
      visible = true;
    }),
    showInactive: vi.fn(() => {
      visible = true;
    }),
    focus: vi.fn(),
    isVisible: () => visible,
    isDestroyed: () => false,
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    setAlwaysOnTop: vi.fn(),
    loadFile: vi.fn(async () => undefined),
    emit(event: string) {
      (listeners.get(event) ?? []).forEach((listener) => listener());
    },
  };
}

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload?: unknown) => unknown>();
  const sent: Array<{ channel: string; payload: unknown }> = [];

  return {
    handlers,
    sent,
    statusWindow: undefined as never,
    petWindow: undefined as never,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => electronMock.petWindow),
      getAllWindows: vi.fn(() => [{
        webContents: {
          send: vi.fn((channel: string, payload: unknown) => sent.push({ channel, payload })),
        },
        isDestroyed: () => false,
      }]),
    },
    screen: {
      getDisplayMatching: vi.fn(() => ({ workArea })),
      getDisplayNearestPoint: vi.fn(() => ({ id: 1 })),
      getPrimaryDisplay: vi.fn(() => ({ id: 1, bounds: workArea })),
    },
    dialog: { showOpenDialog: vi.fn() },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  dialog: electronMock.dialog,
  ipcMain: electronMock.ipcMain,
  screen: electronMock.screen,
}));

vi.mock("../../src/main/windows/petOverlayWindows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/windows/petOverlayWindows")>();

  return {
    ...actual,
    createPetStatusWindow: vi.fn(() => electronMock.statusWindow),
    createPetBubbleWindow: vi.fn(() => createFakeWindow({ x: 0, y: 0, width: 200, height: 60 })),
    createPetMenuWindow: vi.fn(() => createFakeWindow({ x: 0, y: 0, width: 200, height: 200 })),
  };
});

type TestConfig = typeof defaultAppConfig;

function withVitals(patch: Partial<TestConfig["vitals"]>): TestConfig {
  return { ...defaultAppConfig, vitals: { ...defaultAppConfig.vitals, ...patch } };
}

function createDeps(config: TestConfig) {
  return {
    configService: {
      getConfig: vi.fn(() => config),
      setConfig: vi.fn(() => config),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] })),
    },
    invokePluginAction: vi.fn(),
    preloadPath: "D:/app/preload/index.cjs",
    rendererIndexPath: "D:/app/renderer/index.html",
    petWindow: electronMock.petWindow as never,
    petVitalsService: {
      getSnapshot: vi.fn(() => ({ stats: { affinity: 24, satiety: 72, mood: 66 } })),
      applyAction: vi.fn(),
      reset: vi.fn(),
      onChanged: vi.fn(),
    },
  };
}

function setup(overrides: { config?: TestConfig } = {}) {
  const statusWindow = createFakeWindow({ x: 0, y: 0, ...petVitalsPanelSizes.compact });
  const petWindow = {
    webContents: { send: vi.fn() },
    getBounds: vi.fn(() => ({ ...petBounds })),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
  };

  electronMock.statusWindow = statusWindow as never;
  electronMock.petWindow = petWindow as never;

  const deps = createDeps(overrides.config ?? defaultAppConfig);
  const controller = registerCoreIpc(deps as never);
  const click = (inside: boolean) => electronMock.handlers
    .get(ipcChannels.petVitalsStatusPetClick)?.({ sender: {} }, { inside });
  controller.syncPetVitalsStatus();

  return { click, controller, deps, statusWindow, petWindow };
}

describe("pet vitals status window IPC", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.sent.length = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps the on-demand card hidden until the pet is clicked", () => {
    const { click, statusWindow } = setup({ config: withVitals({ hudMode: "click" }) });

    expect(statusWindow.isVisible()).toBe(false);
    expect(statusWindow.setBounds).not.toHaveBeenCalled();

    expect(click(true)).toMatchObject({ visible: true });
    expect(statusWindow.isVisible()).toBe(true);
    expect(statusWindow.setBounds).toHaveBeenCalledWith(autoBounds);
    expect(statusWindow.show).toHaveBeenCalled();
    expect(statusWindow.focus).toHaveBeenCalled();

    // A click on the empty space around the pet hides it again.
    expect(click(false)).toMatchObject({ visible: false });
    expect(statusWindow.isVisible()).toBe(false);
  });

  it("hides the card when it loses focus to another window", () => {
    vi.useFakeTimers();
    const { click, statusWindow } = setup({ config: withVitals({ hudMode: "click" }) });

    click(true);
    expect(statusWindow.isVisible()).toBe(true);

    statusWindow.emit("blur");
    // Nothing happens during the grace period, so a pet click can still win.
    expect(statusWindow.isVisible()).toBe(true);

    vi.advanceTimersByTime(200);
    expect(statusWindow.isVisible()).toBe(false);

    // Summoning again and clicking the pet keeps it open across the blur.
    click(true);
    statusWindow.emit("blur");
    click(true);
    vi.advanceTimersByTime(200);
    expect(statusWindow.isVisible()).toBe(true);
  });

  it("ignores pet clicks while the card is pinned on screen", () => {
    const { click, statusWindow } = setup({ config: withVitals({ hudMode: "always" }) });

    expect(statusWindow.isVisible()).toBe(true);
    // Auto-show never steals focus.
    expect(statusWindow.showInactive).toHaveBeenCalled();
    expect(statusWindow.focus).not.toHaveBeenCalled();

    expect(click(false)).toMatchObject({ visible: true });
    statusWindow.emit("blur");
    expect(statusWindow.isVisible()).toBe(true);
  });

  it("keeps a hidden card off even when the pet is clicked", () => {
    const { click, statusWindow } = setup({ config: withVitals({ hudMode: "hidden" }) });

    expect(statusWindow.isVisible()).toBe(false);
    expect(click(true)).toMatchObject({ visible: false });
    expect(statusWindow.isVisible()).toBe(false);
  });

  it("parks the free card where the config says and reports the anchor", () => {
    const config = withVitals({ hudMode: "always", hudPosition: { x: 40, y: 400 } });
    const { statusWindow } = setup({ config });

    expect(statusWindow.setBounds).toHaveBeenCalledWith({ x: 40, y: 400, width: 240, height: 162 });

    const state = electronMock.handlers.get(ipcChannels.petVitalsStatusToggle)?.({ sender: {} }, { visible: undefined });
    expect(state).toMatchObject({ anchor: "custom", position: { x: 40, y: 400 }, visible: true });
  });

  it("moves a dragged card by screen deltas and clamps it inside the work area", () => {
    const { statusWindow } = setup({ config: withVitals({ hudMode: "always" }) });

    expect(statusWindow.getBounds()).toEqual(autoBounds);

    const moved = electronMock.handlers.get(ipcChannels.petVitalsStatusMoveBy)?.({ sender: {} }, { deltaX: 60, deltaY: -30 });
    expect(statusWindow.getBounds()).toEqual({ x: autoBounds.x + 60, y: autoBounds.y - 30, width: 240, height: 162 });
    expect(moved).toMatchObject({ anchor: "custom", position: { x: autoBounds.x + 60, y: autoBounds.y - 30 } });

    electronMock.handlers.get(ipcChannels.petVitalsStatusMoveBy)?.({ sender: {} }, { deltaX: 4000, deltaY: 4000 });
    expect(statusWindow.getBounds()).toEqual({ x: 552, y: 430, width: 240, height: 162 });

    electronMock.handlers.get(ipcChannels.petVitalsStatusMoveBy)?.({ sender: {} }, { deltaX: -4000, deltaY: -4000 });
    expect(statusWindow.getBounds()).toEqual({ x: 8, y: 8, width: 240, height: 162 });
  });

  it("pins a dragged position only when the drag ends", () => {
    const { deps, statusWindow } = setup({ config: withVitals({ hudMode: "always" }) });

    electronMock.handlers.get(ipcChannels.petVitalsStatusMoveBy)?.({ sender: {} }, { deltaX: 25, deltaY: 15 });
    expect(deps.configService.setConfig).not.toHaveBeenCalled();

    const pinned = electronMock.handlers.get(ipcChannels.petVitalsStatusAnchor)?.({ sender: {} }, { anchor: "custom" });
    expect(deps.configService.setConfig).toHaveBeenCalledWith({
      vitals: { hudPosition: { x: autoBounds.x + 25, y: autoBounds.y + 15 } },
    });
    expect(pinned).toMatchObject({ anchor: "custom" });
    expect(statusWindow.getBounds()).toEqual({ x: autoBounds.x + 25, y: autoBounds.y + 15, width: 240, height: 162 });
  });

  it("restores the follow-the-pet anchor and clears the stored position", () => {
    const config = withVitals({ hudMode: "always", hudPosition: { x: 40, y: 400 } });
    const { deps, statusWindow } = setup({ config });

    const state = electronMock.handlers.get(ipcChannels.petVitalsStatusAnchor)?.({ sender: {} }, { anchor: "auto" });

    expect(deps.configService.setConfig).toHaveBeenCalledWith({ vitals: { hudPosition: null } });
    expect(state).toMatchObject({ anchor: "auto", position: null });
    expect(statusWindow.getBounds()).toEqual(autoBounds);
  });

  it("persists a session-only drag on quit and broadcasts layout changes", () => {
    const { controller, deps } = setup({ config: withVitals({ hudMode: "always" }) });

    electronMock.handlers.get(ipcChannels.petVitalsStatusMoveBy)?.({ sender: {} }, { deltaX: 10, deltaY: 10 });
    controller.persistPetVitalsStatusPosition();

    expect(deps.configService.setConfig).toHaveBeenCalledWith({
      vitals: { hudPosition: { x: autoBounds.x + 10, y: autoBounds.y + 10 } },
    });

    const layouts = electronMock.sent.filter((entry) => entry.channel === ipcChannels.petVitalsStatusLayout);
    expect(layouts.length).toBeGreaterThan(0);
    expect(layouts.at(-1)?.payload).toMatchObject({ anchor: "custom", position: { x: autoBounds.x + 10, y: autoBounds.y + 10 } });
    expect(controller.syncPetVitalsStatus()).toMatchObject({ anchor: "custom" });
  });
});