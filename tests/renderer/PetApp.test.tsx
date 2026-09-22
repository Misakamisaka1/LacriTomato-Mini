import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PetApp } from "../../src/renderer/shell/PetApp";
import { defaultAppConfig } from "../../src/shared/configSchema";

let openMenuFromMain: (() => void) | undefined;
let bubbleFromMain: ((message: unknown) => void) | undefined;
let emotionFromMain: ((payload: { emotion: string; bubbleText?: string }) => void) | undefined;
let menuActionFromMain: ((action: string) => void) | undefined;
let configChangedFromMain: ((config: typeof defaultAppConfig) => void) | undefined;
let skinChangedFromMain: ((result: unknown) => void) | undefined;

const defaultPluginItems = [
  { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
  { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
];

const screenshotOnlyItems = [
  { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
];

const skinResult = {
  skin: {
    manifest: {
      id: "mint",
      displayName: "Mint",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 100,
      frameHeight: 200,
      columns: 2,
      rows: 1,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///D:/pets/mint/spritesheet.webp",
    sourcePath: "D:/pets/mint",
    source: "local",
  },
  fallbackUsed: false,
};

const api = {
  config: {
    get: vi.fn(),
    set: vi.fn(),
    setApiKey: vi.fn(),
    hasApiKey: vi.fn(),
    getApiKeyStatus: vi.fn(),
    onChanged: vi.fn((callback: (config: typeof defaultAppConfig) => void) => {
      configChangedFromMain = callback;
      return vi.fn();
    }),
  },
  plugins: {
    listMenuItems: vi.fn(),
        listContributions: vi.fn(),
    invokeAction: vi.fn(),
  },
  model: {
    translate: vi.fn(),
    chat: vi.fn(),
    testConnection: vi.fn(),
  },
  windowControls: {
    close: vi.fn(),
  },
  chat: {
    listHistory: vi.fn(),
    clearHistory: vi.fn(),
    getMemory: vi.fn(),
    setMemory: vi.fn(),
    clearMemory: vi.fn(),
    send: vi.fn(),
    replyToProactiveTopic: vi.fn(),
  },
  pet: {
    moveBy: vi.fn(),
    syncBodySize: vi.fn(),
    savePosition: vi.fn(),
    showBubbleLayer: vi.fn(),
    hideBubbleLayer: vi.fn(),
    showMenuLayer: vi.fn(),
    hideMenuLayer: vi.fn(),
    selectMenuAction: vi.fn(),
    chooseMenuPlacement: vi.fn(),
    getCurrentSkin: vi.fn(),
    importSkinFolder: vi.fn(),
    resetSkin: vi.fn(),
    openPetdex: vi.fn(),
    listPetdexPets: vi.fn(),
    installPetdexSkin: vi.fn(),
    listManagedSkins: vi.fn(),
    useManagedSkin: vi.fn(),
    deleteManagedSkin: vi.fn(),
    onSkinChanged: vi.fn((callback: (result: unknown) => void) => {
      skinChangedFromMain = callback;
      return vi.fn();
    }),
    onBubble: vi.fn((callback: (message: unknown) => void) => {
      bubbleFromMain = callback;
      return vi.fn();
    }),
    onEmotion: vi.fn((callback: (payload: { emotion: string; bubbleText?: string }) => void) => {
      emotionFromMain = callback;
      return vi.fn();
    }),
    onOpenMenu: vi.fn((callback: () => void) => {
      openMenuFromMain = callback;
      return vi.fn();
    }),
    onMenuAction: vi.fn((callback: (action: string) => void) => {
      menuActionFromMain = callback;
      return vi.fn();
    }),
  },
};

function dispatchPointerLikeEvent(target: Element, type: string, init: MouseEventInit) {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  });
}

async function renderPetApp() {
  const result = render(<PetApp />);
  await act(async () => undefined);
  return result;
}

async function openPetMenuFromMain() {
  await act(async () => {
    openMenuFromMain?.();
    await Promise.resolve();
  });
}

describe("PetApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    api.config.get.mockResolvedValue(defaultAppConfig);
    api.plugins.listMenuItems.mockResolvedValue(defaultPluginItems);
    api.pet.chooseMenuPlacement.mockResolvedValue("top");
    api.pet.getCurrentSkin.mockResolvedValue(undefined);
    openMenuFromMain = undefined;
    bubbleFromMain = undefined;
    emotionFromMain = undefined;
    menuActionFromMain = undefined;
    configChangedFromMain = undefined;
    skinChangedFromMain = undefined;
    window.petdex = api;
  });


  it("loads a runtime pet skin and sizes the body from its manifest", async () => {
    api.pet.getCurrentSkin.mockResolvedValueOnce(skinResult);

    const { container } = await renderPetApp();

    await waitFor(() => expect(api.pet.getCurrentSkin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenLastCalledWith(112, 224));
    expect(container.querySelector<HTMLElement>(".pet-sprite")?.style.backgroundImage).toContain("mint/spritesheet.webp");
  });

  it("applies skin changed events without restarting the pet", async () => {
    const { container } = await renderPetApp();

    act(() => {
      skinChangedFromMain?.(skinResult);
    });

    await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenLastCalledWith(112, 224));
    expect(container.querySelector<HTMLElement>(".pet-sprite")?.style.backgroundImage).toContain("mint/spritesheet.webp");
  });
  it("sizes the transparent pet window to the scaled sprite while the menu is closed", async () => {
    api.config.get.mockResolvedValue({
      ...defaultAppConfig,
      pet: { ...defaultAppConfig.pet, defaultHeight: 128 },
    });

    await renderPetApp();

    await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenLastCalledWith(119, 128));
  });

  it("keeps the head menu a fixed distance above the scaled pet", async () => {
    const originalScreenX = Object.getOwnPropertyDescriptor(window, "screenX");
    const originalScreen = Object.getOwnPropertyDescriptor(window, "screen");
    Object.defineProperty(window, "screenX", { configurable: true, value: 120 });
    Object.defineProperty(window, "screen", {
      configurable: true,
      value: { ...window.screen, availWidth: 800 },
    });

    try {
      api.config.get.mockResolvedValue({
        ...defaultAppConfig,
        pet: { ...defaultAppConfig.pet, defaultHeight: 128 },
      });
      const { container } = await renderPetApp();
      const root = container.querySelector(".pet-root");

      if (!root) {
        throw new Error("Pet root was not rendered");
      }

      await openPetMenuFromMain();

      expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
      await waitFor(() => expect(api.pet.showMenuLayer).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ action: "translator.open" })])));
      expect(container.querySelector<HTMLElement>(".pet-head-menu")?.style.bottom).toBe(
        "calc(var(--pet-height) + var(--pet-menu-gap))",
      );
      expect(container.querySelector<HTMLElement>(".pet-head-menu")?.dataset.placement).toBe("top");
    } finally {
      if (originalScreenX) {
        Object.defineProperty(window, "screenX", originalScreenX);
      }
      if (originalScreen) {
        Object.defineProperty(window, "screen", originalScreen);
      }
    }
  });

  it("keeps the top menu when the main process reports enough room", async () => {
    const originalScreenX = Object.getOwnPropertyDescriptor(window, "screenX");
    Object.defineProperty(window, "screenX", { configurable: true, value: 0 });

    try {
      const { container } = await renderPetApp();
      const root = container.querySelector(".pet-root");
      if (!root) {
        throw new Error("Pet root was not rendered");
      }

      await openPetMenuFromMain();

      expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
      await waitFor(() => expect(api.pet.chooseMenuPlacement).toHaveBeenCalledWith(274));
      expect(container.querySelector<HTMLElement>(".pet-head-menu")?.dataset.placement).toBe("top");
    } finally {
      if (originalScreenX) {
        Object.defineProperty(window, "screenX", originalScreenX);
      }
    }
  });

  it("flips the head menu to the available side near a screen edge", async () => {
    api.pet.chooseMenuPlacement.mockResolvedValueOnce("right");
    const originalScreenX = Object.getOwnPropertyDescriptor(window, "screenX");
    const originalScreen = Object.getOwnPropertyDescriptor(window, "screen");
    Object.defineProperty(window, "screenX", { configurable: true, value: 0 });
    Object.defineProperty(window, "screen", {
      configurable: true,
      value: { ...window.screen, availWidth: 260 },
    });

    try {
      const { container } = await renderPetApp();
      const root = container.querySelector(".pet-root");
      if (!root) {
        throw new Error("Pet root was not rendered");
      }

      await openPetMenuFromMain();

      expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
      expect(container.querySelector<HTMLElement>(".pet-head-menu")?.dataset.placement).toBe("right");
    } finally {
      if (originalScreenX) {
        Object.defineProperty(window, "screenX", originalScreenX);
      }
      if (originalScreen) {
        Object.defineProperty(window, "screen", originalScreen);
      }
    }
  });
  it("keeps side menus inside the resized transparent pet window", async () => {
    api.pet.chooseMenuPlacement.mockResolvedValueOnce("right");
    const originalScreenX = Object.getOwnPropertyDescriptor(window, "screenX");
    const originalScreen = Object.getOwnPropertyDescriptor(window, "screen");
    Object.defineProperty(window, "screenX", { configurable: true, value: 0 });
    Object.defineProperty(window, "screen", {
      configurable: true,
      value: { ...window.screen, availWidth: 260 },
    });

    try {
      const { container } = await renderPetApp();
      const root = container.querySelector(".pet-root");
      if (!root) {
        throw new Error("Pet root was not rendered");
      }

      await openPetMenuFromMain();

      expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
      await waitFor(() => expect(api.pet.showMenuLayer).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ action: "translator.open" })])));
      expect(root.getAttribute("data-menu-placement")).toBe("right");
      expect(container.querySelector<HTMLElement>(".pet-head-menu")?.style.bottom).toBe("");
    } finally {
      if (originalScreenX) {
        Object.defineProperty(window, "screenX", originalScreenX);
      }
      if (originalScreen) {
        Object.defineProperty(window, "screen", originalScreen);
      }
    }
  });
  it("keeps left click available for dragging and opens the head menu from right click", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    expect(screen.queryByRole("button", { name: "打开宠物功能菜单" })).toBeNull();
    fireEvent.click(root);

    expect(screen.queryByRole("button", { name: "翻译" })).toBeNull();

    await openPetMenuFromMain();

    expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  });

  it("refreshes plugin menu items every time the head menu opens", async () => {
    api.plugins.listMenuItems
      .mockResolvedValueOnce(defaultPluginItems)
      .mockResolvedValueOnce(screenshotOnlyItems);
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    await waitFor(() => expect(api.plugins.listMenuItems).toHaveBeenCalledTimes(1));

    await openPetMenuFromMain();

    await waitFor(() => expect(api.plugins.listMenuItems).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "翻译" })).toBeNull();
    expect(await screen.findByRole("button", { name: "截图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  });

  it("moves the window through the pet movement API during left-button drag", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    dispatchPointerLikeEvent(root, "pointerdown", { button: 0, screenX: 100, screenY: 100 });
    dispatchPointerLikeEvent(root, "pointermove", { screenX: 116, screenY: 124 });
    dispatchPointerLikeEvent(root, "pointerup", { button: 0, screenX: 116, screenY: 124 });

    expect(api.pet.moveBy).toHaveBeenCalledWith(16, 24);
  });


  it("uses walk animations that match the drag direction", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");
    const sprite = () => container.querySelector(".pet-sprite");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    dispatchPointerLikeEvent(root, "pointerdown", { button: 0, screenX: 100, screenY: 100 });
    dispatchPointerLikeEvent(root, "pointermove", { screenX: 120, screenY: 100 });

    expect(sprite()?.getAttribute("data-animation")).toBe("runRight");

    dispatchPointerLikeEvent(root, "pointermove", { screenX: 90, screenY: 100 });

    expect(sprite()?.getAttribute("data-animation")).toBe("runLeft");
  });

  it("switches to waving animation while the pointer is hovering over the pet", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");
    const body = () => container.querySelector(".pet-body");
    const sprite = () => container.querySelector(".pet-sprite");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    fireEvent.pointerEnter(root);

    expect(body()?.getAttribute("data-hovering")).toBe("true");
    expect(sprite()?.getAttribute("data-animation")).toBe("waving");

    fireEvent.pointerLeave(root);

    expect(body()?.getAttribute("data-hovering")).toBeNull();
  });

  it("pauses hover waving while opening and closing the head menu", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");
    const body = () => container.querySelector(".pet-body");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    fireEvent.pointerEnter(root);
    expect(body()?.getAttribute("data-hovering")).toBe("true");

    await openPetMenuFromMain();
    expect(body()?.getAttribute("data-hovering")).toBeNull();

    act(() => {
      menuActionFromMain?.("translator.open");
    });
    await waitFor(() => expect(api.plugins.invokeAction).toHaveBeenCalledWith("translator.open"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "翻译" })).toBeNull());
    expect(api.pet.hideMenuLayer).toHaveBeenCalled();
    expect(body()?.getAttribute("data-hovering")).toBeNull();
  });
  it("opens the head menu when the main process suppresses the Windows system menu", async () => {
    await renderPetApp();

    expect(api.pet.onOpenMenu).toHaveBeenCalledTimes(1);
    expect(openMenuFromMain).toBeTypeOf("function");

    await openPetMenuFromMain();

    expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
  });
  it("toggles the head menu closed when the main process reports another right click", async () => {
    await renderPetApp();

    await openPetMenuFromMain();
    expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();

    await openPetMenuFromMain();

    await waitFor(() => expect(screen.queryByRole("button", { name: "翻译" })).toBeNull());
  });  it("opens from the renderer right-click event and ignores the native duplicate", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    fireEvent.contextMenu(root);
    expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();

    await openPetMenuFromMain();
    expect(screen.getByRole("button", { name: "翻译" })).toBeTruthy();

    fireEvent.contextMenu(root);
    await waitFor(() => expect(screen.queryByRole("button", { name: "翻译" })).toBeNull());
  });
  it("ignores duplicate right-click open events while the menu is already opening", async () => {
    let resolveItems: ((items: typeof defaultPluginItems) => void) | undefined;
    api.plugins.listMenuItems
      .mockResolvedValueOnce(defaultPluginItems)
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveItems = resolve;
      }));

    await renderPetApp();

    await waitFor(() => expect(api.plugins.listMenuItems).toHaveBeenCalledTimes(1));

    await act(async () => {
      openMenuFromMain?.();
      openMenuFromMain?.();
      await Promise.resolve();
    });

    expect(api.plugins.listMenuItems).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveItems?.(defaultPluginItems);
      await Promise.resolve();
    });

    expect(await screen.findByRole("button", { name: "翻译" })).toBeTruthy();
    expect(api.pet.chooseMenuPlacement).toHaveBeenCalledTimes(1);
  });
  it("opens the head menu layer without resizing the pet body for menu content", async () => {
    await renderPetApp();
    await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenCalled());
    api.pet.syncBodySize.mockClear();

    await openPetMenuFromMain();

    await waitFor(() => expect(api.pet.showMenuLayer).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ action: "translator.open" }),
      expect.objectContaining({ action: "settings.open" }),
    ])));
    expect(api.pet.syncBodySize).not.toHaveBeenCalled();
  });
  it("renders proactive pet bubbles with a reply button", async () => {
    await renderPetApp();

    act(() => {
      bubbleFromMain?.({
        text: "要聊聊今天的计划吗？",
        emotion: "attentive",
        actionLabel: "回复",
        action: { type: "chat.replyToTopic", topicId: "topic-1" },
      });
    });

    expect(screen.getByRole("status").textContent).toContain("要聊聊今天的计划吗？");
    fireEvent.click(screen.getByRole("button", { name: "回复" }));

    expect(api.chat.replyToProactiveTopic).toHaveBeenCalledWith("topic-1");
  });
  it("keeps the proactive reply button when a matching emotion update follows the bubble", async () => {
    await renderPetApp();

    act(() => {
      bubbleFromMain?.({
        text: "要聊聊今天的计划吗？",
        emotion: "attentive",
        actionLabel: "回复",
        action: { type: "chat.replyToTopic", topicId: "topic-1" },
      });
      emotionFromMain?.({ emotion: "attentive", bubbleText: "要聊聊今天的计划吗？" });
    });

    fireEvent.click(screen.getByRole("button", { name: "回复" }));

    expect(api.chat.replyToProactiveTopic).toHaveBeenCalledWith("topic-1");
  });
  it("shows long pet bubbles in the bubble layer without resizing the pet body", async () => {
    await renderPetApp();
    await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenCalled());
    api.pet.syncBodySize.mockClear();

    act(() => {
      bubbleFromMain?.({
        text: "爸爸，我今天学会了一点新的小事情，想认真跟你分享一下，也想听听你今天有没有什么开心的小瞬间。",
        emotion: "attentive",
        actionLabel: "回复",
        action: { type: "chat.replyToTopic", topicId: "topic-long" },
      });
    });

    await waitFor(() => expect(api.pet.showBubbleLayer).toHaveBeenCalledWith(expect.objectContaining({
      text: "爸爸，我今天学会了一点新的小事情，想认真跟你分享一下，也想听听你今天有没有什么开心的小瞬间。",
      action: { type: "chat.replyToTopic", topicId: "topic-long" },
    })));
    expect(api.pet.syncBodySize).not.toHaveBeenCalled();
  });
  it("renders transient pet bubbles sent by the main process", async () => {
    vi.useFakeTimers();
    await renderPetApp();

    act(() => {
      bubbleFromMain?.("API Key 已保存");
    });

    expect(screen.getByRole("status").textContent).toBe("API Key 已保存");

    act(() => {
      vi.advanceTimersByTime(3600);
    });

    expect(screen.queryByText("API Key 已保存")).toBeNull();
  });

  it("uses the failed animation for error bubbles", async () => {
    const { container } = await renderPetApp();
    const sprite = () => container.querySelector(".pet-sprite");

    act(() => {
      bubbleFromMain?.("操作失败");
    });

    expect(sprite()?.getAttribute("data-animation")).toBe("failed");
  });

  it("keeps the pet still while wandering is disabled", async () => {
    vi.useFakeTimers();
    const { container } = await renderPetApp();

    act(() => {
      vi.advanceTimersByTime(4200);
    });

    expect(api.pet.moveBy).not.toHaveBeenCalled();
    expect(container.querySelector(".pet-sprite")?.getAttribute("data-animation")).toBe("idle");
  });

  it("applies live pet config changes and wanders only when enabled", async () => {
    vi.useFakeTimers();
    await renderPetApp();

    expect(api.config.onChanged).toHaveBeenCalledTimes(1);
    await act(async () => {
      configChangedFromMain?.({
        ...defaultAppConfig,
        pet: { ...defaultAppConfig.pet, wanderEnabled: true, opacity: 0.55 },
      });
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(api.pet.moveBy).toHaveBeenCalledWith(10, 0);
    expect(screen.getByRole("main").getAttribute("style")).toContain("opacity: 0.55");
  });
  it("keeps the pet visually still while the head menu is open", async () => {
    const { container } = await renderPetApp();
    const root = container.querySelector(".pet-root");
    const body = () => container.querySelector(".pet-body");
    const sprite = () => container.querySelector(".pet-sprite");

    if (!root) {
      throw new Error("Pet root was not rendered");
    }

    await openPetMenuFromMain();

    await screen.findByRole("button", { name: "翻译" });
    expect(root.getAttribute("data-menu-open")).toBe("true");
    expect(body()?.getAttribute("data-behavior-mode")).toBe("idle");
    expect(sprite()?.getAttribute("data-animation")).toBe("idle");
  });

  describe("vitals click mode", () => {
    /** The status card listens for pet clicks, so install the bridge on demand. */
    function installVitalsBridge() {
      const notifyPetClick = vi.fn(async () => undefined);
      window.petdex = {
        ...api,
        pet: { ...api.pet, vitals: { notifyPetClick } },
      } as unknown as typeof window.petdex;

      return notifyPetClick;
    }

    it("reports a left click on the pet body", async () => {
      const { container } = await renderPetApp();
      const notifyPetClick = installVitalsBridge();
      const body = container.querySelector(".pet-body");

      if (!body) {
        throw new Error("Pet body was not rendered");
      }

      dispatchPointerLikeEvent(body, "pointerdown", { button: 0, screenX: 100, screenY: 100 });
      dispatchPointerLikeEvent(body, "pointerup", { button: 0, screenX: 100, screenY: 100 });

      expect(notifyPetClick).toHaveBeenCalledWith(true);
    });

    it("hit-tests the pet body because the sprite ignores pointer events", async () => {
      const { container } = await renderPetApp();
      const notifyPetClick = installVitalsBridge();
      const root = container.querySelector(".pet-root");
      const body = container.querySelector(".pet-body");

      if (!root || !body) {
        throw new Error("Pet root was not rendered");
      }

      // The window is taller than the pet, so only the sprite rectangle counts.
      body.getBoundingClientRect = () => ({
        bottom: 400, height: 300, left: 0, right: 200, top: 100, width: 200, x: 0, y: 100,
      }) as DOMRect;

      // A click on the root inside the pet rectangle is a click on the pet.
      dispatchPointerLikeEvent(root, "pointerdown", { button: 0, clientX: 100, clientY: 250, screenX: 900, screenY: 950 });
      dispatchPointerLikeEvent(root, "pointerup", { button: 0, clientX: 100, clientY: 250, screenX: 900, screenY: 950 });
      expect(notifyPetClick).toHaveBeenLastCalledWith(true);

      // A click above the pet is a click outside it.
      dispatchPointerLikeEvent(root, "pointerdown", { button: 0, clientX: 100, clientY: 40, screenX: 900, screenY: 740 });
      dispatchPointerLikeEvent(root, "pointerup", { button: 0, clientX: 100, clientY: 40, screenX: 900, screenY: 740 });
      expect(notifyPetClick).toHaveBeenLastCalledWith(false);
    });

    it("reports a left click on the empty space around the pet", async () => {
      const { container } = await renderPetApp();
      const notifyPetClick = installVitalsBridge();
      const root = container.querySelector(".pet-root");

      if (!root) {
        throw new Error("Pet root was not rendered");
      }

      dispatchPointerLikeEvent(root, "pointerdown", { button: 0, screenX: 400, screenY: 90 });
      dispatchPointerLikeEvent(root, "pointerup", { button: 0, screenX: 400, screenY: 90 });

      expect(notifyPetClick).toHaveBeenCalledWith(false);
    });

    it("does not treat a drag as a click", async () => {
      const { container } = await renderPetApp();
      const notifyPetClick = installVitalsBridge();
      const body = container.querySelector(".pet-body");

      if (!body) {
        throw new Error("Pet body was not rendered");
      }

      dispatchPointerLikeEvent(body, "pointerdown", { button: 0, screenX: 100, screenY: 100 });
      dispatchPointerLikeEvent(body, "pointermove", { screenX: 160, screenY: 140 });
      dispatchPointerLikeEvent(body, "pointerup", { button: 0, screenX: 160, screenY: 140 });

      expect(api.pet.moveBy).toHaveBeenCalledWith(60, 40);
      expect(notifyPetClick).not.toHaveBeenCalled();
    });
  });
});
