import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import petManifest from "../../../assets/pet/pet.json";
import { defaultAppConfig, type AppConfig } from "../../shared/configSchema";
import {
  createInitialPetBehavior,
  reducePetBehavior,
  type PetAnimationName,
  type PetBubble,
  type PetEmotion,
  type PetEmotionPayload,
} from "../../shared/petBehavior";
import type { PetManifest, PetSkinLoadResult } from "../../shared/petManifest";
import type { PluginMenuItem } from "../../shared/pluginTypes";
import { PetHeadMenu } from "../components/PetHeadMenu";
import { PetSprite } from "../components/PetSprite";
import "./PetApp.css";

const fallbackMenuItems: PluginMenuItem[] = [
  { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
  { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
  { id: "settings.open", label: "设置", action: "settings.open", icon: "Settings" },
];

const localMenuItems = fallbackMenuItems.filter(
  (item) => item.action === "settings.open",
);

const fallbackManifest = petManifest as PetManifest;
const fallbackSpritesheetUrl = "../../assets/pet/spritesheet.webp";
const behaviorTickMs = 400;
const petMenuKeyWidth = 64;
const petMenuKeyGap = 6;
const petMenuHeight = 54;
const petMenuGap = 8;
const petBubbleWidth = 280;
const petBubbleHeight = 86;
const petBubbleExtraInset = 16;
const petEmotions: PetEmotion[] = ["attentive", "thinking", "happy", "sleepy", "waving", "jumping", "failed", "waiting", "running", "review"];
const contextMenuSignalDedupeMs = 250;

type PetMenuPlacement = "top" | "left" | "right";
type PetResizeAnchor = "bottom-center" | "bottom-left" | "bottom-right";
interface DragPoint {
  x: number;
  y: number;
}

function readCoordinate(primary: number | undefined, fallback: number | undefined) {
  if (typeof primary === "number" && Number.isFinite(primary)) {
    return primary;
  }

  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }

  return 0;
}

function readDragPoint(event: PointerEvent<HTMLElement>): DragPoint {
  return {
    x: readCoordinate(event.screenX, event.clientX),
    y: readCoordinate(event.screenY, event.clientY),
  };
}

function isMenuTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".pet-head-menu"));
}

function isPrimaryPointer(event: PointerEvent<HTMLElement>) {
  return event.button === 0 || event.buttons === 1 || typeof event.button !== "number";
}

function appendLocalMenuItems(pluginItems: PluginMenuItem[]) {
  const pluginActions = new Set(pluginItems.map((item) => item.action));
  return [
    ...pluginItems,
    ...localMenuItems.filter((item) => !pluginActions.has(item.action)),
  ];
}

const animationAliases: Partial<Record<PetAnimationName, string>> = {
  walkRight: "runRight",
  walkLeft: "runLeft",
  attentive: "waiting",
  happy: "jumping",
  thinking: "running",
  sleepy: "idle",
};

function getAnimation(activeManifest: PetManifest, name: PetAnimationName) {
  const alias = animationAliases[name];
  return activeManifest.animations[name]
    ?? (alias ? activeManifest.animations[alias] : undefined)
    ?? activeManifest.animations.idle
    ?? { frames: [0], fps: 6, loop: true };
}

function isPetEmotion(value: unknown): value is PetEmotion {
  return typeof value === "string" && petEmotions.includes(value as PetEmotion);
}

function emotionForBubble(message: string): PetEmotion {
  if (["失败", "错误", "没有", "占用", "未就绪"].some((keyword) => message.includes(keyword))) {
    return "failed";
  }

  return "happy";
}

function readBubblePayload(payload: unknown): (Omit<PetBubble, "emotion"> & { emotion?: PetEmotion; durationMs?: number }) | undefined {
  if (typeof payload === "string") {
    return { text: payload };
  }

  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const candidate = payload as Partial<PetBubble> & { durationMs?: number };
  if (typeof candidate.text !== "string") {
    return undefined;
  }

  return {
    text: candidate.text,
    emotion: isPetEmotion(candidate.emotion) ? candidate.emotion : undefined,
    actionLabel: typeof candidate.actionLabel === "string" ? candidate.actionLabel : undefined,
    action: candidate.action?.type === "chat.replyToTopic" && typeof candidate.action.topicId === "string"
      ? candidate.action
      : undefined,
    durationMs: typeof candidate.durationMs === "number" ? candidate.durationMs : undefined,
  };
}

function findMenuLabel(items: PluginMenuItem[], action: string) {
  return items.find((item) => item.action === action)?.label;
}

function getHorizontalMenuWidth(itemCount: number) {
  return itemCount > 0
    ? itemCount * petMenuKeyWidth + Math.max(0, itemCount - 1) * petMenuKeyGap
    : 0;
}

function getVerticalMenuHeight(itemCount: number) {
  return itemCount > 0
    ? itemCount * petMenuHeight + Math.max(0, itemCount - 1) * petMenuKeyGap
    : 0;
}

function getResizeAnchor(placement: PetMenuPlacement): PetResizeAnchor {
  if (placement === "right") {
    return "bottom-left";
  }

  if (placement === "left") {
    return "bottom-right";
  }

  return "bottom-center";
}

function getPetContentSize(options: {
  contentPetWidth: number;
  displayHeight: number;
  hasBubble: boolean;
  bubbleHeight?: number;
  bubbleWidth?: number;
  itemCount: number;
  placement: PetMenuPlacement;
}) {
  const sideMenuOpen = options.itemCount > 0 && options.placement !== "top";
  const horizontalMenuWidth = options.itemCount > 0 ? getHorizontalMenuWidth(options.itemCount) : 0;
  const verticalMenuHeight = options.itemCount > 0 ? getVerticalMenuHeight(options.itemCount) : 0;
  const measuredBubbleHeight = options.hasBubble ? Math.max(petBubbleHeight, options.bubbleHeight ?? 0) : 0;
  const measuredBubbleWidth = options.hasBubble ? Math.max(petBubbleWidth, options.bubbleWidth ?? 0) : 0;
  const contentBubbleWidth = options.hasBubble ? measuredBubbleWidth : 0;
  const contentTopInset = Math.max(
    options.itemCount > 0 && !sideMenuOpen ? petMenuHeight + petMenuGap : 0,
    options.hasBubble ? measuredBubbleHeight + petMenuGap + petBubbleExtraInset : 0,
  );

  return {
    height: (sideMenuOpen ? Math.max(options.displayHeight, verticalMenuHeight) : options.displayHeight) + contentTopInset,
    width: sideMenuOpen
      ? Math.max(options.contentPetWidth + petMenuGap + petMenuKeyWidth, contentBubbleWidth)
      : Math.max(options.contentPetWidth, horizontalMenuWidth, contentBubbleWidth),
  };
}
export function PetApp() {
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig);
  const [skin, setSkin] = useState(() => ({
    manifest: fallbackManifest,
    spritesheetUrl: fallbackSpritesheetUrl,
  }));
  const activeManifest = skin.manifest;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOpening, setMenuOpening] = useState(false);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>(fallbackMenuItems);
  const [menuPlacement, setMenuPlacement] = useState<PetMenuPlacement>("top");
  const [behavior, setBehavior] = useState(() => createInitialPetBehavior(Date.now()));
  const [frame, setFrame] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragAnimation, setDragAnimation] = useState<"runLeft" | "runRight" | undefined>();
  const [bubbleSize, setBubbleSize] = useState({ height: 0, width: 0 });
  const dragPointRef = useRef<DragPoint | undefined>(undefined);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuOpenRef = useRef(false);
  const menuOpeningRef = useRef(false);
  const lastRendererContextMenuAtRef = useRef(Number.NEGATIVE_INFINITY);
  const hoverActive = !menuOpen && !menuOpening && !dragging && hovering;
  const hoverAnimation = hoverActive ? "jumping" : undefined;
  const displayAnimation = menuOpen || menuOpening ? "idle" : dragAnimation ?? hoverAnimation ?? behavior.animation;
  const currentAnimation = useMemo(() => getAnimation(activeManifest, displayAnimation), [activeManifest, displayAnimation]);
  const interactionPaused = menuOpen || menuOpening || hoverActive || dragging;

  const applyEmotion = useCallback((emotion: PetEmotion, bubbleText?: string, durationMs?: number) => {
    setBehavior((current) => reducePetBehavior(current, {
      type: "emotion",
      now: Date.now(),
      emotion,
      bubbleText,
      durationMs,
    }));
  }, []);

  const applyBubble = useCallback((payload: unknown) => {
    const bubble = readBubblePayload(payload);
    if (!bubble) {
      return;
    }

    setBehavior((current) => reducePetBehavior(current, {
      type: "bubble",
      now: Date.now(),
      text: bubble.text,
      emotion: bubble.emotion ?? emotionForBubble(bubble.text),
      actionLabel: bubble.actionLabel,
      action: bubble.action,
      durationMs: bubble.durationMs,
    }));
  }, []);

  const applySkinResult = useCallback((result: PetSkinLoadResult | undefined) => {
    if (!result?.skin) {
      return;
    }

    setSkin({
      manifest: result.skin.manifest,
      spritesheetUrl: result.skin.spritesheetUrl,
    });

    if (result.warning) {
      applyBubble({ text: result.warning, emotion: "failed", durationMs: 2600 });
    }
  }, [applyBubble]);
  const loadMenuItems = useCallback(async () => {
    try {
      const items = await window.petdex?.plugins.listMenuItems();
      if (items) {
        return appendLocalMenuItems(items);
      }
    } catch {
      // Keep the pet usable even if the main process bridge is temporarily unavailable.
    }

    return fallbackMenuItems;
  }, []);

  const refreshMenuItems = useCallback(async () => {
    setMenuItems(await loadMenuItems());
  }, [loadMenuItems]);

  const syncBodySize = useCallback((width: number, height: number) => {
    const resizePromise = window.petdex?.pet?.syncBodySize?.(width, height);
    return resizePromise?.catch(() => undefined) ?? Promise.resolve();
  }, []);

  const closeMenu = useCallback(() => {
    menuOpenRef.current = false;
    menuOpeningRef.current = false;
    setMenuOpening(false);
    setHovering(false);
    setMenuOpen(false);
    void window.petdex?.pet?.hideMenuLayer?.();
  }, []);

  const openMenu = useCallback(async () => {
    if (menuOpenRef.current || menuOpeningRef.current) {
      return;
    }

    menuOpeningRef.current = true;
    setMenuOpening(true);
    setHovering(false);
    setDragging(false);
    setDragAnimation(undefined);
    dragPointRef.current = undefined;

    try {
      const nextItems = await loadMenuItems();
      const nextPlacement = await window.petdex?.pet?.chooseMenuPlacement(getHorizontalMenuWidth(nextItems.length))
        .catch(() => "top" as PetMenuPlacement) ?? "top";
      const nextDisplayHeight = config.pet.defaultHeight;
      const nextContentPetWidth = Math.ceil((activeManifest.frameWidth * nextDisplayHeight) / activeManifest.frameHeight);
      void nextDisplayHeight;
      void nextContentPetWidth;
      await Promise.resolve(window.petdex?.pet?.showMenuLayer?.(nextItems)).catch(() => undefined);
      menuOpenRef.current = true;
      setMenuItems(nextItems);
      setMenuPlacement(nextPlacement);
      setMenuOpen(true);
    } finally {
      menuOpeningRef.current = false;
      setMenuOpening(false);
    }
  }, [activeManifest, config.pet.defaultHeight, loadMenuItems]);

  const toggleMenu = useCallback((source: "main" | "renderer" = "main") => {
    const now = Date.now();
    if (source === "renderer") {
      lastRendererContextMenuAtRef.current = now;
    } else if (now - lastRendererContextMenuAtRef.current < contextMenuSignalDedupeMs) {
      return;
    }

    setHovering(false);
    setDragging(false);
    setDragAnimation(undefined);
    dragPointRef.current = undefined;

    if (menuOpeningRef.current) {
      return;
    }

    if (menuOpenRef.current) {
      closeMenu();
      return;
    }

    void openMenu();
  }, [closeMenu, openMenu]);


  useLayoutEffect(() => {
    if (!behavior.bubble) {
      setBubbleSize((current) => current.height === 0 && current.width === 0 ? current : { height: 0, width: 0 });
      return;
    }

    const bubbleElement = bubbleRef.current;
    if (!bubbleElement) {
      return;
    }

    const updateBubbleSize = () => {
      const rect = bubbleElement.getBoundingClientRect();
      const next = {
        height: Math.ceil(rect.height),
        width: Math.ceil(rect.width),
      };

      if (next.height <= 0 || next.width <= 0) {
        return;
      }

      setBubbleSize((current) => current.height === next.height && current.width === next.width ? current : next);
    };

    updateBubbleSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateBubbleSize);
    observer.observe(bubbleElement);
    return () => observer.disconnect();
  }, [behavior.bubble]);
  useEffect(() => {
    let active = true;

    void window.petdex?.config.get()
      .then((nextConfig) => {
        if (active && nextConfig) {
          setConfig(nextConfig);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void window.petdex?.pet?.getCurrentSkin?.()
      .then((result) => {
        if (active) {
          applySkinResult(result);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [applySkinResult]);

  useEffect(() => {
    return window.petdex?.pet?.onSkinChanged?.((result) => {
      applySkinResult(result);
    });
  }, [applySkinResult]);
  useEffect(() => {
    void refreshMenuItems();
  }, [refreshMenuItems]);

  useEffect(() => {
    return window.petdex?.config?.onChanged?.((nextConfig) => {
      setConfig(nextConfig);
      void refreshMenuItems();
    });
  }, [refreshMenuItems]);

  useEffect(() => {
    return window.petdex?.pet?.onOpenMenu(() => {
      toggleMenu("main");
    });
  }, [toggleMenu]);

  useEffect(() => {
    return window.petdex?.pet?.onMenuAction?.((action) => {
      void invoke(action);
    });
  });

  useEffect(() => {
    return window.petdex?.pet?.onBubble((message) => {
      applyBubble(message);
    });
  }, [applyBubble]);

  useEffect(() => {
    return window.petdex?.pet?.onEmotion((payload: PetEmotionPayload) => {
      if (!isPetEmotion(payload.emotion)) {
        return;
      }

      applyEmotion(payload.emotion, payload.bubbleText, payload.durationMs);
    });
  }, [applyEmotion]);

  useEffect(() => {
    setFrame(0);
  }, [displayAnimation, activeManifest]);

  useEffect(() => {
    const fps = Math.max(1, currentAnimation.fps * config.pet.animationSpeed);
    const frameMs = Math.max(80, Math.round(1000 / fps));
    const timer = window.setInterval(() => {
      setFrame((value) => {
        const nextValue = value + 1;
        if (currentAnimation.loop) {
          return nextValue % currentAnimation.frames.length;
        }

        return Math.min(nextValue, currentAnimation.frames.length - 1);
      });
    }, frameMs);

    return () => window.clearInterval(timer);
  }, [config.pet.animationSpeed, currentAnimation]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBehavior((current) => {
        const next = reducePetBehavior(current, {
          type: "tick",
          now: Date.now(),
          paused: interactionPaused,
          wanderEnabled: config.pet.wanderEnabled,
        });

        if (next.movement) {
          void window.petdex?.pet?.moveBy(next.movement.deltaX, next.movement.deltaY);
        }

        return next;
      });
    }, behaviorTickMs);

    return () => window.clearInterval(timer);
  }, [config.pet.wanderEnabled, interactionPaused]);

  async function invoke(action: string) {
    const label = findMenuLabel(menuItems, action);
    applyEmotion("thinking", label ? `正在打开${label}` : "正在处理");

    try {
      await window.petdex?.plugins.invokeAction(action);
      applyEmotion("happy", label ? `${label}已打开` : "完成啦", 1400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      applyEmotion("failed", message, 2600);
    } finally {
      setHovering(false);
      closeMenu();
    }
  }

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (!isPrimaryPointer(event) || isMenuTarget(event.target)) {
      return;
    }

    dragPointRef.current = readDragPoint(event);
    setDragAnimation(undefined);
    setDragging(true);
    applyEmotion("attentive", undefined, 900);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const point = dragPointRef.current;
    if (!point) {
      return;
    }

    const nextPoint = readDragPoint(event);
    const deltaX = nextPoint.x - point.x;
    const deltaY = nextPoint.y - point.y;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    dragPointRef.current = nextPoint;
    if (deltaX > 0) {
      setDragAnimation("runRight");
    } else if (deltaX < 0) {
      setDragAnimation("runLeft");
    }
    void window.petdex?.pet?.moveBy(deltaX, deltaY);
  }

  function stopDrag(event: PointerEvent<HTMLElement>) {
    dragPointRef.current = undefined;
    setDragging(false);
    setDragAnimation(undefined);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const savePositionPromise = window.petdex?.pet?.savePosition?.();
    void savePositionPromise?.catch(() => undefined);
  }

  const safeFrame = Math.min(frame, currentAnimation.frames.length - 1);
  const frameIndex = currentAnimation.frames[safeFrame] ?? activeManifest.animations.idle?.frames[0] ?? 0;
  const displayHeight = config.pet.defaultHeight;
  const spriteWidth = (activeManifest.frameWidth * displayHeight) / activeManifest.frameHeight;
  const contentPetWidth = Math.ceil(spriteWidth);
  const sideMenuOpen = menuOpen && menuPlacement !== "top";
  const { width: contentWidth, height: contentHeight } = getPetContentSize({
    contentPetWidth,
    displayHeight,
    hasBubble: Boolean(behavior.bubble),
    bubbleHeight: bubbleSize.height,
    bubbleWidth: bubbleSize.width,
    itemCount: menuOpen ? menuItems.length : 0,
    placement: menuPlacement,
  });
  const resizeAnchor = getResizeAnchor(menuPlacement);
  const visualBehaviorMode = menuOpen || menuOpening ? "idle" : behavior.mode;
  const rootStyle = {
    opacity: config.pet.opacity,
    width: contentPetWidth,
    height: displayHeight,
    "--pet-height": `${displayHeight}px`,
    "--pet-menu-gap": `${petMenuGap}px`,
  } as CSSProperties;

  useEffect(() => {
    void syncBodySize(contentPetWidth, displayHeight);
  }, [contentPetWidth, displayHeight, syncBodySize]);

  useEffect(() => {
    if (behavior.bubble) {
      void Promise.resolve(window.petdex?.pet?.showBubbleLayer?.(behavior.bubble)).catch(() => undefined);
      return;
    }

    void Promise.resolve(window.petdex?.pet?.hideBubbleLayer?.()).catch(() => undefined);
  }, [behavior.bubble]);

  useEffect(() => {
    return () => {
      void window.petdex?.pet?.hideBubbleLayer?.();
      void window.petdex?.pet?.hideMenuLayer?.();
    };
  }, []);

  return (
    <main
      className="pet-root"
      data-pet-mode={behavior.mode}
      data-menu-open={menuOpen ? "true" : undefined}
      data-menu-placement={menuOpen ? menuPlacement : undefined}
      style={rootStyle}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onContextMenu={(event) => {
        event.preventDefault();
        toggleMenu("renderer");
      }}
    >
      {behavior.bubble && (
        <div ref={bubbleRef} className={`pet-bubble pet-bubble--${behavior.bubble.emotion}`} role="status" aria-live="polite">
          <span className="pet-bubble__text">{behavior.bubble.text}</span>
          {behavior.bubble.action && behavior.bubble.actionLabel && (
            <button
              type="button"
              className="pet-bubble__reply"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void window.petdex?.chat?.replyToProactiveTopic(behavior.bubble?.action?.topicId ?? "");
              }}
            >
              {behavior.bubble.actionLabel}
            </button>
          )}
        </div>
      )}
      <PetHeadMenu open={menuOpen} items={menuItems} placement={menuPlacement} onAction={invoke} />
      <div
        className="pet-body"
        data-behavior-mode={visualBehaviorMode}
        data-hovering={hoverActive ? "true" : undefined}
        aria-label={`${activeManifest.displayName} desktop pet`}
        style={{ width: spriteWidth, height: displayHeight }}
      >
        <PetSprite
          spritesheetUrl={skin.spritesheetUrl}
          frameWidth={activeManifest.frameWidth}
          frameHeight={activeManifest.frameHeight}
          frameIndex={frameIndex}
          columns={activeManifest.columns}
          displayHeight={displayHeight}
          animationName={displayAnimation}
        />
      </div>
    </main>
  );
}
