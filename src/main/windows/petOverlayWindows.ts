import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from "electron";

export type PetMenuPlacement = "top" | "left" | "right";

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
