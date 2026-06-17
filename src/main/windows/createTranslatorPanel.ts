import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createTranslatorPanel(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 760,
    height: 560,
    title: "翻译",
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "translator" } });
  return window;
}
