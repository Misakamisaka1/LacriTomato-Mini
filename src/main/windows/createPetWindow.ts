import { BrowserWindow, type Event as ElectronEvent } from "electron";
import { join } from "node:path";
import type { AppConfig } from "../../shared/configSchema.js";
import { ipcChannels } from "../../shared/ipcChannels.js";


const contextMenuDedupeMs = 200;
export function createPetWindow(
  preloadPath: string,
  petConfig?: AppConfig["pet"],
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
): BrowserWindow {
  const window = new BrowserWindow({
    width: 460,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: petConfig?.alwaysOnTop ?? true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (petConfig?.alwaysOnTop ?? true) {
    window.setAlwaysOnTop(true, "screen-saver");
  }

  let lastOpenMenuAt = Number.NEGATIVE_INFINITY;
  const openPetMenu = (event: ElectronEvent) => {
    event.preventDefault();
    const now = Date.now();
    if (now - lastOpenMenuAt < contextMenuDedupeMs) {
      return;
    }

    lastOpenMenuAt = now;
    window.webContents.send(ipcChannels.petOpenMenu);
  };

  window.on("system-context-menu", openPetMenu);
  window.webContents.on("context-menu", openPetMenu);

  window.loadFile(rendererIndexPath, { query: { view: "pet" } });
  return window;
}



