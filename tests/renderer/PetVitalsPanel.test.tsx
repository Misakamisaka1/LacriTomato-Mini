import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PetVitalsPanel } from "../../src/renderer/components/PetVitalsPanel";
import { createInitialPetVitals, createPetVitalsSnapshot, type PetVitalsHudMode, type PetVitalsState } from "../../src/shared/petVitals";

const nowMs = Date.now();

function makeSnapshot(overrides: Partial<PetVitalsState> = {}, options: { enabled?: boolean; hudMode?: PetVitalsHudMode } = {}) {
  const state = createInitialPetVitals(nowMs, { satiety: 80, mood: 62, affinity: 44, ...overrides });
  return createPetVitalsSnapshot(state, nowMs, { enabled: options.enabled ?? true, hudMode: options.hudMode ?? "click" });
}

function renderPanel(props: Partial<Parameters<typeof PetVitalsPanel>[0]> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onAction: vi.fn(),
    onOpenSettings: vi.fn(),
    onMoveBy: vi.fn(),
    onDragEnd: vi.fn(),
    onFollowPet: vi.fn(),
  };

  const result = render(
    <PetVitalsPanel
      snapshot={makeSnapshot()}
      expanded={false}
      placement="right"
      petName="Mint"
      {...handlers}
      {...props}
    />,
  );

  return { ...result, ...handlers };
}

/**
 * jsdom has no PointerEvent, so pointer gestures are dispatched as mouse events
 * carrying real screen coordinates (the card drag only reads screenX/screenY).
 */
function pointerEvent(type: string, screen: { x: number; y: number }) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    screenX: screen.x,
    screenY: screen.y,
  });
}

function dragHeader(from: { x: number; y: number }, to: { x: number; y: number }) {
  const header = screen.getByRole("button", { name: "展开宠物状态栏" });
  fireEvent(header, pointerEvent("pointerdown", from));
  fireEvent(header, pointerEvent("pointermove", to));
  return header;
}

function dropHeader(header: HTMLElement, at: { x: number; y: number }) {
  fireEvent(header, pointerEvent("pointerup", at));
}

describe("PetVitalsPanel", () => {
  it("shows the compact card with the pet's meters and level", () => {
    renderPanel();

    expect(screen.getByText("Mint")).toBeTruthy();
    expect(screen.getByText("Lv.1 · 初次相遇")).toBeTruthy();
    const satiety = screen.getByRole("progressbar", { name: "饱食度" });
    expect(satiety.getAttribute("aria-valuenow")).toBe("80");
    expect(screen.getByRole("progressbar", { name: "好感度" }).getAttribute("aria-valuenow")).toBe("44");
    expect(screen.getByText("拖动移动 · 点击展开")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /喂食/ })).toBeNull();
  });

  it("hides the drag hint when the card cannot be moved", () => {
    renderPanel({ onMoveBy: undefined });

    expect(screen.getByText("点击展开")).toBeTruthy();
  });

  it("expands and collapses from the header", () => {
    const { onToggle } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "展开宠物状态栏" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("runs care actions from the expanded card", () => {
    const { onAction } = renderPanel({ expanded: true });

    fireEvent.click(screen.getByRole("button", { name: /喂食/ }));
    fireEvent.click(screen.getByRole("button", { name: /玩耍/ }));
    fireEvent.click(screen.getByRole("button", { name: /抚摸/ }));

    expect(onAction.mock.calls.map((call) => call[0])).toEqual(["feed", "play", "pet"]);
    expect(screen.getByText("羁绊进度")).toBeTruthy();
  });

  it("keeps an action disabled until its cooldown runs out", () => {
    renderPanel({
      expanded: true,
      snapshot: makeSnapshot({ cooldownUntilMs: { feed: nowMs + 20_000 } }),
    });

    const feed = screen.getByRole("button", { name: /喂食/ }) as HTMLButtonElement;

    expect(feed.disabled).toBe(true);
    expect(feed.textContent).toMatch(/\d+s/);
  });

  it("disables an action that the pet cannot accept right now", () => {
    renderPanel({
      expanded: true,
      snapshot: makeSnapshot({ satiety: 8 }),
    });

    const play = screen.getByRole("button", { name: /玩耍/ }) as HTMLButtonElement;

    expect(play.disabled).toBe(true);
    expect(play.getAttribute("title")).toContain("先喂点东西");
  });

  it("surfaces low meters, care warnings and a paused system", () => {
    renderPanel({
      expanded: true,
      snapshot: makeSnapshot({ satiety: 12, mood: 18, affinity: 8 }, { enabled: false }),
    });

    expect(screen.getByText("饱食度偏低，记得喂点东西")).toBeTruthy();
    expect(screen.getByText("养成系统已暂停，累计数据仍会保留")).toBeTruthy();
    expect(screen.getByText("Lv.1 · 初次相遇")).toBeTruthy();
  });

  it("opens the settings panel from the expanded footer", () => {
    const { onOpenSettings } = renderPanel({ expanded: true });

    fireEvent.click(screen.getByRole("button", { name: "养成设置" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("shows a placeholder while the vitals state is loading", () => {
    renderPanel({ snapshot: undefined });

    expect(screen.getByText("正在读取宠物状态…")).toBeTruthy();
  });

  it("drags the card by the header and reports the screen deltas", () => {
    const { onMoveBy, onDragEnd, onToggle } = renderPanel();
    const header = dragHeader({ x: 500, y: 400 }, { x: 540, y: 380 });

    expect(onMoveBy).toHaveBeenCalledWith(40, -20);

    dropHeader(header, { x: 540, y: 380 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    // The click that follows a drag must not collapse the card again.
    fireEvent.click(header);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps reporting deltas while the drag continues", () => {
    const { onMoveBy } = renderPanel();
    const header = dragHeader({ x: 500, y: 400 }, { x: 520, y: 400 });

    fireEvent(header, pointerEvent("pointermove", { x: 530, y: 410 }));
    fireEvent(header, pointerEvent("pointermove", { x: 530, y: 420 }));

    expect(onMoveBy.mock.calls).toEqual([[20, 0], [10, 10], [0, 10]]);
  });

  it("ignores tiny pointer wobbles so a click still expands the card", () => {
    const { onMoveBy, onDragEnd, onToggle } = renderPanel();
    const header = dragHeader({ x: 500, y: 400 }, { x: 502, y: 401 });

    expect(onMoveBy).not.toHaveBeenCalled();

    dropHeader(header, { x: 502, y: 401 });
    expect(onDragEnd).not.toHaveBeenCalled();

    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("tells the user how the card is positioned and offers to follow the pet", () => {
    const { onFollowPet } = renderPanel({ expanded: true, anchor: "auto" });
    expect(screen.getByText("跟随宠物")).toBeTruthy();
    expect(screen.getByText("拖动标题可自由摆放")).toBeTruthy();

    onFollowPet.mockClear();
    const custom = renderPanel({ expanded: true, anchor: "custom" });

    expect(screen.getAllByText("自由位置").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "回到宠物身边" }));

    expect(custom.onFollowPet).toHaveBeenCalledTimes(1);
  });

  it("uses the tail offset reported by the main process", () => {
    renderPanel({ tailOffset: 72 });

    const card = screen.getByLabelText("宠物状态栏");
    expect(card.getAttribute("data-anchor")).toBe("auto");
    expect(card.getAttribute("style")).toContain("--pv-tail-top: 72px");
  });
});