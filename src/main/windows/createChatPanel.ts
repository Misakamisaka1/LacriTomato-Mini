import { BrowserWindow } from "electron";
import { join } from "node:path";

export interface ChatPanelOptions {
  initialDraft?: string;
}

export function createChatPanel(
  preloadPath: string,
  options: ChatPanelOptions = {},
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 620,
    title: "和宠物聊天",
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(rendererIndexPath, { query: { view: "chat", draft: options.initialDraft ?? "" } });
  return window;
}
