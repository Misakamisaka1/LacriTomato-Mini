import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createSettingsWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    title: "LacriTomato Mini 设置",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "settings" } });
  return window;
}
