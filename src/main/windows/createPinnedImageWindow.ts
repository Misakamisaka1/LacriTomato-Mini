import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createPinnedImageWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "pinned-image" } });
  return window;
}
