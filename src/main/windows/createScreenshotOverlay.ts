import { BrowserWindow, type Display } from "electron";
import { join } from "node:path";

export interface ScreenshotOverlayOptions {
  preloadPath: string;
  display: Display;
  rendererIndexPath?: string;
}

/**
 * Creates a per-display screenshot overlay window.
 *
 * Each display gets its own fullscreen transparent overlay so mouse input is
 * always captured by the correct window (no click-through on transparent gaps
 * of a giant virtual-desktop window) and the toolbar is always positioned
 * within the active display.
 */
export function createScreenshotOverlay({
  preloadPath,
  display,
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
}: ScreenshotOverlayOptions): BrowserWindow {
  const { bounds, scaleFactor } = display;
  // Electron BrowserWindow bounds are in DIP; display.bounds is already DIP.
  // `fullscreenable` must stay enabled on Windows so we can enter fullscreen
  // after show; a plain (non-fullscreen) window gets clamped to the work area
  // by the window manager, leaving the taskbar strip uncovered.
  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    enableLargerThanScreen: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: process.platform === "win32",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");

  // Pass display metadata via query params so the renderer knows its bounds
  // and scale factor without needing an extra IPC round-trip. windowId lets
  // the renderer decide whether it is the overlay currently under the cursor.
  window.loadFile(rendererIndexPath, {
    query: {
      view: "screenshot-overlay",
      windowId: String(window.id),
      displayId: String(display.id),
      displayX: String(bounds.x),
      displayY: String(bounds.y),
      displayWidth: String(bounds.width),
      displayHeight: String(bounds.height),
      scaleFactor: String(scaleFactor),
    },
  });

  // Show immediately so the overlay captures input without delay.
  window.once("ready-to-show", () => {
    if (window.isDestroyed()) {
      return;
    }

    window.show();

    // Windows clamps a shown non-fullscreen window back into the work area, so
    // the transparent mask stops at the top of the taskbar and the bottom strip
    // of the display can never be selected or dimmed. Entering fullscreen makes
    // the window cover the whole display (taskbar included); the fullscreen
    // state survives hide()/show() and losing focus, so overlay restores and
    // per-display overlays keep working. The short re-assert covers the brief
    // race window right after show() where the first call can be ignored.
    if (process.platform === "win32") {
      window.setFullScreen(true);
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setFullScreen(true);
        }
      }, 400);
    }
  });

  return window;
}
