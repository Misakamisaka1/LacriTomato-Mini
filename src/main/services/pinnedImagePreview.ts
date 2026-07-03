import { screen } from "electron";
import type { WindowBounds } from "./pinnedImageZoom.js";

export interface PinnedImagePreviewResult {
  previewing: boolean;
}

export interface PreviewablePinnedWindow {
  getBounds(): WindowBounds;
  setBounds(bounds: WindowBounds, animate?: boolean): void;
}

const previewBoundsByWindow = new WeakMap<PreviewablePinnedWindow, WindowBounds>();

export function setPinnedImageFullscreenPreview(
  window: PreviewablePinnedWindow,
  previewing: boolean,
): PinnedImagePreviewResult {
  const storedBounds = previewBoundsByWindow.get(window);

  if (!previewing) {
    if (storedBounds) {
      window.setBounds(storedBounds, true);
      previewBoundsByWindow.delete(window);
    }

    return { previewing: false };
  }

  if (storedBounds) {
    return { previewing: true };
  }

  const currentBounds = window.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  previewBoundsByWindow.set(window, currentBounds);
  window.setBounds(display.workArea, true);
  return { previewing: true };
}