import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from "electron";
import { petVitalsPanelSizes } from "../../shared/petVitals.js";

export type PetMenuPlacement = "top" | "left" | "right";
export type PetStatusPlacement = "left" | "right";

type BrowserWindowConstructor = new (options: BrowserWindowConstructorOptions) => BrowserWindow;

const petMenuKeyWidth = 64;
const petMenuKeyHeight = 54;
const petMenuKeyGap = 6;
const petOverlayGap = 8;
const petBubbleGap = 4;
const petOverlayEdgeMargin = 24;
const petBubbleWidth = 320;
const petBubbleMinHeight = 72;
const petBubbleMaxHeight = 180;
const petStatusGap = 8;
/** Where the card's centre sits inside the pet sprite: roughly the head. */
const petStatusHeadRatio = 0.28;

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function getHorizontalMenuWidth(itemCount: number) {
  return itemCount > 0
    ? itemCount * petMenuKeyWidth + Math.max(0, itemCount - 1) * petMenuKeyGap
    : petMenuKeyWidth;
}

function getVerticalMenuHeight(itemCount: number) {
  return itemCount > 0
    ? itemCount * petMenuKeyHeight + Math.max(0, itemCount - 1) * petMenuKeyGap
    : petMenuKeyHeight;
}

export function getPetMenuOverlayLayout(
  petBounds: Rectangle,
  workArea: Rectangle,
  itemCount: number,
): { placement: PetMenuPlacement; bounds: Rectangle } {
  const horizontalWidth = getHorizontalMenuWidth(itemCount);
  const topBounds = {
    x: Math.round(petBounds.x + petBounds.width / 2 - horizontalWidth / 2),
    y: Math.round(petBounds.y - petOverlayGap - petMenuKeyHeight),
    width: horizontalWidth,
    height: petMenuKeyHeight,
  };
  const safeLeft = workArea.x + petOverlayEdgeMargin;
  const safeRight = workArea.x + workArea.width - petOverlayEdgeMargin;

  if (topBounds.x >= safeLeft && topBounds.x + topBounds.width <= safeRight) {
    return {
      placement: "top",
      bounds: {
        ...topBounds,
        y: clamp(topBounds.y, workArea.y + petOverlayEdgeMargin, workArea.y + workArea.height - petOverlayEdgeMargin - topBounds.height),
      },
    };
  }

  const sideHeight = getVerticalMenuHeight(itemCount);
  const placement: PetMenuPlacement = topBounds.x < safeLeft ? "right" : "left";
  const x = placement === "right"
    ? petBounds.x + petBounds.width + petOverlayGap
    : petBounds.x - petOverlayGap - petMenuKeyWidth;

  return {
    placement,
    bounds: {
      x: clamp(Math.round(x), workArea.x + petOverlayEdgeMargin, workArea.x + workArea.width - petOverlayEdgeMargin - petMenuKeyWidth),
      y: clamp(
        Math.round(petBounds.y + petBounds.height - sideHeight),
        workArea.y + petOverlayEdgeMargin,
        workArea.y + workArea.height - petOverlayEdgeMargin - sideHeight,
      ),
      width: petMenuKeyWidth,
      height: sideHeight,
    },
  };
}

export function getPetBubbleOverlayHeight(bubble: { text: string; actionLabel?: string }): number {
  const estimatedLines = Math.max(1, Math.ceil(bubble.text.length / 18));
  const actionHeight = bubble.actionLabel ? 22 : 0;
  return clamp(44 + estimatedLines * 19 + actionHeight, petBubbleMinHeight, petBubbleMaxHeight);
}

export function getPetBubbleOverlayBounds(petBounds: Rectangle, workArea: Rectangle, bubbleHeight = petBubbleMinHeight): Rectangle {
  return {
    x: clamp(
      Math.round(petBounds.x + petBounds.width / 2 - petBubbleWidth / 2),
      workArea.x + petOverlayEdgeMargin,
      workArea.x + workArea.width - petOverlayEdgeMargin - petBubbleWidth,
    ),
    y: clamp(
      Math.round(petBounds.y - petBubbleGap - bubbleHeight),
      workArea.y + petOverlayEdgeMargin,
      workArea.y + workArea.height - petOverlayEdgeMargin - bubbleHeight,
    ),
    width: petBubbleWidth,
    height: bubbleHeight,
  };
}

/**
 * The pet sprite is bottom-centred inside its transparent window, so overlay
 * placement has to use the sprite rather than the whole window rectangle.
 */
export function getPetSpriteBounds(
  petBounds: Rectangle,
  bodySize?: { width: number; height: number },
): Rectangle {
  if (!bodySize || bodySize.height <= 0 || bodySize.height > petBounds.height) {
    return petBounds;
  }

  const width = bodySize.width > 0 && bodySize.width <= petBounds.width ? bodySize.width : petBounds.width;

  return {
    x: petBounds.x + Math.round((petBounds.width - width) / 2),
    y: petBounds.y + petBounds.height - bodySize.height,
    width,
    height: bodySize.height,
  };
}

/**
 * The vitals card hangs next to the pet's head, preferring its right side and
 * flipping to the left when the pet stands close to the right screen edge.
 */
export function getPetStatusOverlayLayout(
  petBounds: Rectangle,
  workArea: Rectangle,
  size: { width: number; height: number } = petVitalsPanelSizes.compact,
): { placement: PetStatusPlacement; bounds: Rectangle } {
  const safeLeft = workArea.x + petOverlayEdgeMargin;
  const safeRight = workArea.x + workArea.width - petOverlayEdgeMargin - size.width;
  const rightX = Math.round(petBounds.x + petBounds.width + petStatusGap);
  const leftX = Math.round(petBounds.x - petStatusGap - size.width);
  const petCenter = petBounds.x + petBounds.width / 2;
  const displayCenter = workArea.x + workArea.width / 2;
  const placement: PetStatusPlacement = rightX <= safeRight
    ? "right"
    : leftX >= safeLeft
      ? "left"
      : petCenter <= displayCenter ? "right" : "left";
  const preferredX = placement === "right" ? rightX : leftX;
  // Centre the card on the pet's head so it reads as attached to the sprite.
  const headY = Math.round(petBounds.y + petBounds.height * petStatusHeadRatio - size.height / 2);

  return {
    placement,
    bounds: {
      x: clamp(preferredX, safeLeft, safeRight),
      y: clamp(
        headY,
        workArea.y + petOverlayEdgeMargin,
        workArea.y + workArea.height - petOverlayEdgeMargin - size.height,
      ),
      width: size.width,
      height: size.height,
    },
  };
}

export function createPetBubbleWindow(
  BrowserWindowClass: BrowserWindowConstructor,
  preloadPath: string,
  alwaysOnTop: boolean,
): BrowserWindow {
  const window = new BrowserWindowClass({
    width: petBubbleWidth,
    height: petBubbleMinHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (alwaysOnTop) {
    window.setAlwaysOnTop(true, "screen-saver");
  }

  return window;
}

export function createPetMenuWindow(
  BrowserWindowClass: BrowserWindowConstructor,
  preloadPath: string,
  alwaysOnTop: boolean,
): BrowserWindow {
  const window = new BrowserWindowClass({
    width: petMenuKeyWidth,
    height: petMenuKeyHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (alwaysOnTop) {
    window.setAlwaysOnTop(true, "screen-saver");
  }

  return window;
}

export function createPetStatusWindow(
  BrowserWindowClass: BrowserWindowConstructor,
  preloadPath: string,
  alwaysOnTop: boolean,
  size: { width: number; height: number } = petVitalsPanelSizes.compact,
): BrowserWindow {
  const window = new BrowserWindowClass({
    width: size.width,
    height: size.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (alwaysOnTop) {
    window.setAlwaysOnTop(true, "screen-saver");
  }

  return window;
}