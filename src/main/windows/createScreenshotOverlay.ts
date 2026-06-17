import { BrowserWindow, type Rectangle } from "electron";
import { join } from "node:path";

export function createScreenshotOverlay(preloadPath: string, bounds: Rectangle): BrowserWindow {
  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "screenshot-overlay" } });
  return window;
}
