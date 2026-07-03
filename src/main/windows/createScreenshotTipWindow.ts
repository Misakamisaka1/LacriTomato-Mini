import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

const defaultTipMessage = "截图已复制到剪贴板";
const tipWidth = 420;
const tipHeight = 80;
const tipMargin = 24;
const tipVerticalOffset = 80;
const tipDurationMs = 2000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTipMessage(message: string) {
  const nextMessage = message.trim();
  return (nextMessage || defaultTipMessage).slice(0, 80);
}

export function createScreenshotTipWindow(
  preloadPath: string,
  message: string,
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
): BrowserWindow {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = display.workArea;
  const centeredX = workArea.x + (workArea.width - tipWidth) / 2;
  const centeredYOffset = (workArea.height - tipHeight) / 2 - tipVerticalOffset;
  const x = Math.round(clamp(centeredX, workArea.x + tipMargin, workArea.x + workArea.width - tipWidth - tipMargin));
  const y = Math.round(clamp(workArea.y + centeredYOffset, workArea.y + tipMargin, workArea.y + workArea.height - tipHeight - tipMargin));
  const window = new BrowserWindow({
    x,
    y,
    width: tipWidth,
    height: tipHeight,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.showInactive();
    }
  });
  const closeTimer = setTimeout(() => {
    if (!window.isDestroyed()) {
      window.close();
    }
  }, tipDurationMs);
  window.on("closed", () => clearTimeout(closeTimer));
  window.loadFile(rendererIndexPath, {
    query: { view: "screenshot-tip", message: normalizeTipMessage(message) },
  });
  return window;
}
