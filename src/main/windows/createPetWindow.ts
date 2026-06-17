import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createPetWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 280,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "pet" } });
  return window;
}
