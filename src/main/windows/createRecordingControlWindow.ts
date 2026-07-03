import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

const controlWidth = 244;
const controlHeight = 46;
const controlMargin = 14;

export interface RecordingControlWindowHandle {
  isDestroyed(): boolean;
  close(): void;
  on(eventName: "closed", listener: () => void): unknown;
}

export interface RecordingControlWindowState<TWindow extends RecordingControlWindowHandle = RecordingControlWindowHandle> {
  current?: TWindow;
}

export function toggleRecordingControlWindow<TWindow extends RecordingControlWindowHandle>(
  state: RecordingControlWindowState<TWindow>,
  createWindow: () => TWindow,
): TWindow | undefined {
  if (state.current && !state.current.isDestroyed()) {
    state.current.close();
    state.current = undefined;
    return undefined;
  }

  const window = createWindow();
  state.current = window;
  window.on("closed", () => {
    if (state.current === window) {
      state.current = undefined;
    }
  });
  return window;
}

export function createRecordingControlWindow(
  preloadPath: string,
  rendererIndexPath = join(process.cwd(), "dist/renderer/index.html"),
): BrowserWindow {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = display.workArea;
  const window = new BrowserWindow({
    x: Math.round(workArea.x + workArea.width - controlWidth - controlMargin),
    y: Math.round(workArea.y + controlMargin),
    width: controlWidth,
    height: controlHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
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
  window.loadFile(rendererIndexPath, { query: { view: "recording-control" } });
  return window;
}