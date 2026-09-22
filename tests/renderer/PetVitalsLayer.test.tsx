import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PetVitalsLayer } from "../../src/renderer/shell/PetVitalsLayer";
import { createInitialPetVitals, createPetVitalsSnapshot } from "../../src/shared/petVitals";

const nowMs = Date.now();
const snapshot = createPetVitalsSnapshot(
  createInitialPetVitals(nowMs, { satiety: 70, mood: 60, affinity: 40 }),
  nowMs,
);
const fedSnapshot = createPetVitalsSnapshot(
  createInitialPetVitals(nowMs, { satiety: 96, mood: 65, affinity: 42, points: 14, totals: { feed: 1, treat: 0, play: 0, pet: 0 } }),
  nowMs,
);

let vitalsChanged: ((next: typeof snapshot) => void) | undefined;
type StatusState = {
  visible: boolean;
  expanded: boolean;
  placement: "left" | "right";
  anchor: "auto" | "custom";
  position: { x: number; y: number } | null;
  tailOffset: number;
};
let statusLayoutChanged: ((state: StatusState) => void) | undefined;

const autoStatus: StatusState = {
  visible: true,
  expanded: false,
  placement: "right",
  anchor: "auto",
  position: null,
  tailOffset: 46,
};

const vitalsApi = {
  get: vi.fn(),
  applyAction: vi.fn(),
  reset: vi.fn(),
  toggleStatus: vi.fn(),
  setStatusExpanded: vi.fn(),
  moveStatusBy: vi.fn(),
  setStatusAnchor: vi.fn(),
  getStatus: vi.fn(),
  onChanged: vi.fn((callback: (next: typeof snapshot) => void) => {
    vitalsChanged = callback;
    return vi.fn();
  }),
  onStatusLayout: vi.fn((callback: (state: StatusState) => void) => {
    statusLayoutChanged = callback;
    return vi.fn();
  }),
};

const api = {
  config: {
    get: vi.fn(),
    set: vi.fn(),
    setApiKey: vi.fn(),
    hasApiKey: vi.fn(),
    getApiKeyStatus: vi.fn(),
  },
  plugins: {
    listMenuItems: vi.fn(),
    listContributions: vi.fn(),
    invokeAction: vi.fn(),
  },
  model: { translate: vi.fn(), chat: vi.fn(), testConnection: vi.fn() },
  windowControls: { close: vi.fn() },
  pet: {
    getCurrentSkin: vi.fn(),
    onSkinChanged: vi.fn(() => vi.fn()),
    vitals: vitalsApi,
  },
};

async function renderLayer() {
  const result = render(<PetVitalsLayer />);
  await act(async () => undefined);
  return result;
}

describe("PetVitalsLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vitalsChanged = undefined;
    statusLayoutChanged = undefined;
    vitalsApi.get.mockResolvedValue(snapshot);
    vitalsApi.getStatus.mockResolvedValue(autoStatus);
    vitalsApi.setStatusExpanded.mockImplementation(async (expanded: boolean) => ({ ...autoStatus, expanded }));
    vitalsApi.moveStatusBy.mockImplementation(async (deltaX: number, deltaY: number) => ({
      ...autoStatus,
      anchor: "custom" as const,
      position: { x: 300 + deltaX, y: 200 + deltaY },
      placement: "left" as const,
    }));
    vitalsApi.setStatusAnchor.mockImplementation(async (anchor: "auto" | "custom") => ({
      ...autoStatus,
      anchor,
      position: anchor === "custom" ? { x: 340, y: 220 } : null,
    }));
    vitalsApi.applyAction.mockResolvedValue({
      ok: true,
      action: "feed",
      message: "喂食完成：饱食度 +26",
      reaction: "好好吃，谢谢你！",
      reactionEmotion: "happy",
      effects: [{ key: "satiety", label: "饱食度", delta: 26 }],
      snapshot: fedSnapshot,
    });
    api.pet.getCurrentSkin.mockResolvedValue({
      skin: { manifest: { displayName: "Mint" }, spritesheetUrl: "file:///mint.webp", source: "local" },
      fallbackUsed: false,
    });
    api.plugins.invokeAction.mockResolvedValue(undefined);
    window.petdex = api as never;
  });

  it("loads the live vitals card and follows vitals pushes", async () => {
    await renderLayer();

    expect(await screen.findByText("Mint")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "饱食度" }).getAttribute("aria-valuenow")).toBe("70"));

    act(() => {
      vitalsChanged?.(fedSnapshot);
    });

    await waitFor(() => expect(screen.getByRole("progressbar", { name: "饱食度" }).getAttribute("aria-valuenow")).toBe("96"));
  });

  it("expands the card through the main process", async () => {
    await renderLayer();

    fireEvent.click(await screen.findByRole("button", { name: "展开宠物状态栏" }));

    expect(vitalsApi.setStatusExpanded).toHaveBeenCalledWith(true);
  });

  it("follows layout pushes sent by the main process", async () => {
    await renderLayer();

    act(() => {
      statusLayoutChanged?.({ ...autoStatus, expanded: true, placement: "left", tailOffset: 88 });
    });

    expect(await screen.findByRole("button", { name: /喂食/ })).toBeTruthy();
    const card = screen.getByLabelText("宠物状态栏");
    expect(card.getAttribute("data-placement")).toBe("left");
    expect(card.getAttribute("style")).toContain("--pv-tail-top: 88px");
  });

  it("sends drag deltas to the main process and pins the dropped position", async () => {
    await renderLayer();

    const header = await screen.findByRole("button", { name: "展开宠物状态栏" });
    fireEvent(header, new MouseEvent("pointerdown", { bubbles: true, button: 0, screenX: 400, screenY: 300 }));
    fireEvent(header, new MouseEvent("pointermove", { bubbles: true, screenX: 440, screenY: 320 }));

    await waitFor(() => expect(vitalsApi.moveStatusBy).toHaveBeenCalledWith(40, 20));
    // Nothing is persisted until the pointer is released.
    expect(vitalsApi.setStatusAnchor).not.toHaveBeenCalled();

    fireEvent(header, new MouseEvent("pointerup", { bubbles: true, screenX: 440, screenY: 320 }));

    await waitFor(() => expect(vitalsApi.setStatusAnchor).toHaveBeenCalledWith("custom"));
    await waitFor(() => expect(screen.getByLabelText("宠物状态栏").getAttribute("data-anchor")).toBe("custom"));
  });

  it("returns the card to the pet from the expanded position row", async () => {
    await renderLayer();

    fireEvent.click(await screen.findByRole("button", { name: "展开宠物状态栏" }));
    act(() => {
      statusLayoutChanged?.({ ...autoStatus, expanded: true, anchor: "custom", position: { x: 340, y: 220 } });
    });

    fireEvent.click(await screen.findByRole("button", { name: "回到宠物身边" }));

    await waitFor(() => expect(vitalsApi.setStatusAnchor).toHaveBeenCalledWith("auto"));
    await waitFor(() => expect(screen.getByLabelText("宠物状态栏").getAttribute("data-anchor")).toBe("auto"));
  });

  it("feeds the pet and reports the applied effects", async () => {
    await renderLayer();

    fireEvent.click(await screen.findByRole("button", { name: "展开宠物状态栏" }));
    fireEvent.click(await screen.findByRole("button", { name: /喂食/ }));

    await waitFor(() => expect(vitalsApi.applyAction).toHaveBeenCalledWith("feed"));
    expect(await screen.findByText("饱食度 +26")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "饱食度" }).getAttribute("aria-valuenow")).toBe("96");
  });

  it("opens the settings window from the card", async () => {
    await renderLayer();

    fireEvent.click(await screen.findByRole("button", { name: "展开宠物状态栏" }));
    fireEvent.click(await screen.findByRole("button", { name: "养成设置" }));

    expect(api.plugins.invokeAction).toHaveBeenCalledWith("settings.open");
  });

  it("falls back to a placeholder when the vitals bridge is missing", async () => {
    window.petdex = { ...api, pet: { getCurrentSkin: vi.fn() } } as never;

    await renderLayer();

    expect(await screen.findByText("养成服务未连接")).toBeTruthy();
  });
});