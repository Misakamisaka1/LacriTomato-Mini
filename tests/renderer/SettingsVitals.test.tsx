import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../src/renderer/shell/SettingsApp";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { createInitialPetVitals, createPetVitalsSnapshot } from "../../src/shared/petVitals";

const nowMs = Date.now();
const snapshot = createPetVitalsSnapshot(
  createInitialPetVitals(nowMs, { satiety: 64, mood: 58, affinity: 36, points: 340 }),
  nowMs,
);

const saveConfig = vi.fn();
const showTip = vi.fn();
const applyAction = vi.fn();
const reset = vi.fn();
const toggleStatus = vi.fn();
const setStatusAnchor = vi.fn();
let vitalsChanged: ((next: typeof snapshot) => void) | undefined;

const autoStatus = {
  visible: true,
  expanded: false,
  placement: "right" as const,
  anchor: "auto" as const,
  position: null,
  tailOffset: 46,
};

const vitalsApi = {
  get: vi.fn(),
  applyAction,
  reset,
  toggleStatus,
  setStatusExpanded: vi.fn(),
  moveStatusBy: vi.fn(),
  setStatusAnchor,
  getStatus: vi.fn(),
  onChanged: vi.fn((callback: (next: typeof snapshot) => void) => {
    vitalsChanged = callback;
    return vi.fn();
  }),
  onStatusLayout: vi.fn(() => vi.fn()),
};

describe("SettingsApp vitals section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vitalsChanged = undefined;
    vitalsApi.get.mockResolvedValue(snapshot);
    vitalsApi.getStatus.mockResolvedValue(autoStatus);
    saveConfig.mockImplementation(async (nextConfig) => nextConfig);
    showTip.mockResolvedValue(undefined);
    applyAction.mockResolvedValue({
      ok: true,
      action: "feed",
      message: "喂食完成：饱食度 +26",
      reaction: "好好吃，谢谢你！",
      reactionEmotion: "happy",
      effects: [{ key: "satiety", label: "饱食度", delta: 26 }],
      snapshot,
    });
    reset.mockResolvedValue(snapshot);
    toggleStatus.mockResolvedValue({ ...autoStatus, visible: false });
    setStatusAnchor.mockResolvedValue(autoStatus);

    window.petdex = {
      config: {
        get: vi.fn().mockResolvedValue(defaultAppConfig),
        set: saveConfig,
        setApiKey: vi.fn(),
        hasApiKey: vi.fn().mockResolvedValue(false),
        getApiKeyStatus: vi.fn().mockResolvedValue({ saved: false, secure: true }),
        onChanged: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        listContributions: vi.fn().mockResolvedValue({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] }),
        invokeAction: vi.fn(),
      },
      model: { translate: vi.fn(), chat: vi.fn(), testConnection: vi.fn() },
      screenshot: { showTip } as never,
      pet: { vitals: vitalsApi } as never,
      windowControls: { close: vi.fn() },
    } as never;
  });

  it("shows live vitals values, bond progress and care actions", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));

    expect(await screen.findByText("Lv.3 · 朋友 · 元气满满")).toBeTruthy();
    expect(await screen.findByLabelText("饱食度每小时下降")).toBeTruthy();
    expect(screen.getByLabelText("心情每小时下降")).toBeTruthy();
    expect(screen.getByLabelText("好感度每小时下降")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith("feed"));

    fireEvent.click(screen.getByRole("button", { name: "隐藏状态栏" }));
    await waitFor(() => expect(toggleStatus).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "重置养成状态" }));
    await waitFor(() => expect(reset).toHaveBeenCalled());
  });

  it("saves the vitals toggles and decay rates", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));
    fireEvent.click(await screen.findByLabelText("启用养成系统"));
    fireEvent.change(await screen.findByLabelText("饱食度每小时下降"), { target: { value: "6" } });
    fireEvent.click(await screen.findByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalled());
    const saved = saveConfig.mock.calls.at(-1)?.[0];
    expect(saved.vitals.enabled).toBe(false);
    expect(saved.vitals.satietyDecayPerHour).toBe(6);
  });

  it("lets the status card be pinned, click-summoned or hidden", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));

    const clickMode = await screen.findByRole("button", { name: "点击宠物显示" });
    expect(clickMode.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("左键点宠物才出现，点别处自动收起")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "常驻显示" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalled());
    expect(saveConfig.mock.calls.at(-1)?.[0].vitals.hudMode).toBe("always");
  });

  it("brings a freely placed card back to the pet when click mode is picked", async () => {
    vitalsApi.getStatus.mockResolvedValue({ ...autoStatus, anchor: "custom", position: { x: 512, y: 188 } });
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));
    expect(await screen.findByText(/状态栏当前是自由位置/)).toBeTruthy();

    // The main process reports the follow-the-pet anchor once it is reset.
    vitalsApi.getStatus.mockResolvedValue(autoStatus);
    fireEvent.click(screen.getByRole("button", { name: "点击宠物显示" }));

    await waitFor(() => expect(setStatusAnchor).toHaveBeenCalledWith("auto"));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveConfig).toHaveBeenCalled());
    const saved = saveConfig.mock.calls.at(-1)?.[0];
    expect(saved.vitals.hudMode).toBe("click");
    expect(saved.vitals.hudPosition).toBeNull();
  });

  it("offers the follow-the-pet action only while the card floats freely", async () => {
    vitalsApi.getStatus.mockResolvedValue({ ...autoStatus, anchor: "custom", position: { x: 340, y: 220 } });
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));
    expect(await screen.findByText(/状态栏当前是自由位置/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "状态栏跟随宠物" }));

    await waitFor(() => expect(setStatusAnchor).toHaveBeenCalledWith("auto"));
  });

  it("disables the follow action while the card already follows the pet", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));
    const follow = await screen.findByRole("button", { name: "状态栏跟随宠物" });

    expect((follow as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/拖动状态栏标题栏即可把它摆到任意位置/)).toBeTruthy();
  });

  it("keeps a position dragged while the window was open when saving", async () => {
    vitalsApi.getStatus.mockResolvedValue({ ...autoStatus, anchor: "custom", position: { x: 512, y: 188 } });
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "养成" }));
    fireEvent.click(await screen.findByLabelText("启用养成系统"));
    fireEvent.click(await screen.findByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveConfig).toHaveBeenCalled());
    const saved = saveConfig.mock.calls.at(-1)?.[0];
    expect(saved.vitals.hudPosition).toEqual({ x: 512, y: 188 });
  });
});