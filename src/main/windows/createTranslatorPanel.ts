import { BrowserWindow } from "electron";
import { join } from "node:path";

export interface TranslatorPanelOptions {
  initialText?: string;
  autoTranslate?: boolean;
}

export function createTranslatorPanel(
  preloadPath: string,
  options: TranslatorPanelOptions = {},
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 900,
    minHeight: 680,
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

  window.loadFile(rendererIndexPath, {
    query: {
      view: "translator",
      ...(options.initialText ? { text: options.initialText } : {}),
      ...(options.autoTranslate ? { autoTranslate: "1" } : {}),
    },
  });
  return window;
}