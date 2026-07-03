export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoomablePinnedWindow {
  getBounds(): WindowBounds;
  setBounds(bounds: WindowBounds, animate?: boolean): void;
}

export interface PinnedImageZoomResult {
  zoomed: boolean;
}

const normalBoundsByWindow = new WeakMap<ZoomablePinnedWindow, WindowBounds>();
const defaultZoomSize = { width: 760, height: 520 };

function centeredBounds(current: WindowBounds, width: number, height: number): WindowBounds {
  return {
    x: Math.round(current.x - (width - current.width) / 2),
    y: Math.round(current.y - (height - current.height) / 2),
    width,
    height,
  };
}

export function togglePinnedImageZoom(window: ZoomablePinnedWindow): PinnedImageZoomResult {
  const normalBounds = normalBoundsByWindow.get(window);
  if (normalBounds) {
    window.setBounds(normalBounds, true);
    normalBoundsByWindow.delete(window);
    return { zoomed: false };
  }

  const currentBounds = window.getBounds();
  const zoomedBounds = centeredBounds(
    currentBounds,
    Math.max(currentBounds.width, defaultZoomSize.width),
    Math.max(currentBounds.height, defaultZoomSize.height),
  );

  normalBoundsByWindow.set(window, currentBounds);
  window.setBounds(zoomedBounds, true);
  return { zoomed: true };
}
