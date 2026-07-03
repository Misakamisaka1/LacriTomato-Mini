import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createPinnedImageWindow(
  preloadPath: string,
  captureId: string,
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(rendererIndexPath, {
    query: { view: "pinned-image", captureId },
  });
  return window;
}