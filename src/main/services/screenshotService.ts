import { BrowserWindow, clipboard, desktopCapturer, nativeImage, screen, type Display, type NativeImage, type Rectangle } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import type { AppConfig } from "../../shared/configSchema.js";
import { ipcChannels } from "../../shared/ipcChannels.js";
import { createScreenshotOverlay } from "../windows/createScreenshotOverlay.js";
import {
  createScreenshotFilename,
  type ImageSize,
  isUsableSelection,
  scaleSelectionToImageRect,
  type ScreenshotCaptureOptions,
  type ScreenshotCaptureResult,
  type ScreenshotCursorSession,
  type ScreenshotCursorUpdate,
  type ScreenshotSaveResult,
  type ScreenshotSelection,
  type ScreenshotSessionState,
  type ScreenshotSessionUpdate,
  type ScreenshotWindowTarget,
} from "../../plugins/screenshot/workflow.js";
import { listScreenshotWindowTargets } from "./windowTargetService.js";

interface CaptureRecord extends ScreenshotCaptureResult {
  /** Full-resolution source of truth; copy/save/OCR/flattening read from it. */
  image: NativeImage;
  /** Lazily computed full-resolution PNG, cached on first demand. */
  png?: Buffer;
  createdAt: number;
}

interface ScreenshotSession {
  overlays: Map<number, BrowserWindow>;
  displays: Display[];
  union: ScreenshotSelection;
  activeOverlayId?: number;
  state: ScreenshotSessionState;
  /** Needed to rebuild overlays when the display layout changes mid-session. */
  preloadPath?: string;
  /** Window targets enumerated once per session and shared by all overlays. */
  cachedWindowTargets?: ScreenshotWindowTarget[];
  /** Downscaled per-display snapshots used by the selection magnifier (loupe). */
  backgrounds?: Map<number, SessionBackground>;
}

export interface ScreenshotServiceOptions {
  userDataPath: string;
  rendererIndexPath?: string;
  maxCaptures?: number;
}

export interface ScreenshotService {
  startAreaCapture(preloadPath: string): Promise<BrowserWindow[]>;
  captureSelection(sourceWindow: BrowserWindow, selection: ScreenshotSelection, options?: ScreenshotCaptureOptions): Promise<ScreenshotCaptureResult>;
  updateCapture(captureId: string, dataUrl: string): ScreenshotCaptureResult;
  copyCapture(captureId: string): void;
  saveCapture(captureId: string, config: AppConfig["screenshot"]): ScreenshotSaveResult;
  getCapture(captureId: string): ScreenshotCaptureResult | undefined;
  listWindowTargets(): Promise<ScreenshotWindowTarget[]>;
  getCapturePng(captureId: string): Buffer;
  /** Full-resolution PNG of a capture, without caching (transient renderer use). */
  getCaptureImage(captureId: string): Buffer;
  /** Downscaled background snapshot for a display, used by the loupe. */
  getBackground(displayId: number): { width: number; height: number; dataUrl: string } | undefined;
  getCursorSession(requestingWindow?: BrowserWindow): ScreenshotCursorSession;
  reportSession(update: ScreenshotSessionUpdate): void;
  closeAllOverlays(): void;
}

const captureMaxAgeMs = 1000 * 60 * 30;
const defaultMaxCaptures = 20;
/** Longest edge of the preview dataUrl shown by the overlay / pinned window. */
const previewMaxEdge = 2048;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downscales a capture to a preview-sized dataUrl for display. The
 * full-resolution image stays in the main process and is only encoded when a
 * save/copy/OCR/flatten operation actually needs it.
 */
function createPreviewDataUrl(image: NativeImage) {
  const size = image.getSize();
  const longestEdge = Math.max(size.width, size.height);
  if (longestEdge <= previewMaxEdge) {
    return image.toDataURL();
  }

  const scale = previewMaxEdge / longestEdge;
  return image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: "best",
  }).toDataURL();
}

function createCaptureId() {
  return `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCaptureThumbnailSize(display: Display) {
  return {
    width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor)),
  };
}

function computeUnionBounds(displays: Display[]): ScreenshotSelection {
  if (displays.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const x = Math.min(...displays.map((display) => display.bounds.x));
  const y = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function findDisplayContainingPoint(displays: Display[], point: { x: number; y: number }): Display | undefined {
  return displays.find((display) => {
    const { bounds } = display;
    return point.x >= bounds.x
      && point.x < bounds.x + bounds.width
      && point.y >= bounds.y
      && point.y < bounds.y + bounds.height;
  });
}

/**
 * Finds the overlay window currently under the cursor. Overlays never overlap
 * in normal layouts; when they do (unusual DIP folds) the most recently shown
 * one wins, matching Windows z-order.
 */
function findActiveOverlayId(point: { x: number; y: number }, overlays: Map<number, BrowserWindow>) {
  let activeId: number | undefined;
  for (const [id, window] of overlays) {
    if (window.isDestroyed()) {
      continue;
    }
    const bounds = window.getBounds();
    if (point.x >= bounds.x
      && point.x < bounds.x + bounds.width
      && point.y >= bounds.y
      && point.y < bounds.y + bounds.height) {
      activeId = id;
    }
  }
  return activeId;
}

function toDisplaySelection(absoluteSelection: Rectangle, display: Display): ScreenshotSelection {
  const left = Math.max(absoluteSelection.x, display.bounds.x);
  const top = Math.max(absoluteSelection.y, display.bounds.y);
  const right = Math.min(absoluteSelection.x + absoluteSelection.width, display.bounds.x + display.bounds.width);
  const bottom = Math.min(absoluteSelection.y + absoluteSelection.height, display.bounds.y + display.bounds.height);

  return {
    x: Math.max(0, left - display.bounds.x),
    y: Math.max(0, top - display.bounds.y),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function hasVisibleSelection(selection: ScreenshotSelection) {
  return selection.width > 0 && selection.height > 0;
}

function resizeImageToDestination(image: NativeImage, destination: ImageSize) {
  const size = image.getSize();
  if (size.width === destination.width && size.height === destination.height) {
    return image;
  }

  return image.resize({
    width: destination.width,
    height: destination.height,
    quality: "best",
  });
}

/**
 * Stitches per-display crops into one physical-pixel canvas.
 *
 * Position fold: Chromium lays out `display.bounds` (DIP) by scaling each
 * monitor's physical layout position with the primary display's scale factor
 * (verified empirically: physical 2560,326 on a 1.25x primary reports DIP
 * 2048,261). Sizes stay native per display (thumbnail = bounds × own scale),
 * so mixed-DPI screens keep their full pixel resolution in the result. Each
 * crop additionally carries its own physical offset inside the display image.
 */
function stitchDisplayPieces(
  pieces: Array<{ image: NativeImage; display: Display; cropRect: Rectangle }>,
  union: ScreenshotSelection,
  primaryScale: number,
): NativeImage {
  const placements = pieces.map((piece) => {
    const size = piece.image.getSize();
    return {
      image: piece.image,
      size,
      physX: Math.round((piece.display.bounds.x - union.x) * primaryScale) + piece.cropRect.x,
      physY: Math.round((piece.display.bounds.y - union.y) * primaryScale) + piece.cropRect.y,
    };
  });

  const minX = Math.min(...placements.map((piece) => piece.physX));
  const minY = Math.min(...placements.map((piece) => piece.physY));
  const maxX = Math.max(...placements.map((piece) => piece.physX + piece.size.width));
  const maxY = Math.max(...placements.map((piece) => piece.physY + piece.size.height));
  const canvasWidth = Math.max(1, maxX - minX);
  const canvasHeight = Math.max(1, maxY - minY);

  // Transparent black canvas; regions without a display stay transparent.
  const buffer = Buffer.alloc(canvasWidth * canvasHeight * 4);

  for (const piece of placements) {
    const { size } = piece;
    if (size.width <= 0 || size.height <= 0) {
      continue;
    }

    const bitmap = piece.image.toBitmap();
    const dstX = piece.physX - minX;
    const dstY = piece.physY - minY;
    for (let row = 0; row < size.height; row += 1) {
      const canvasRow = dstY + row;
      if (canvasRow < 0 || canvasRow >= canvasHeight) {
        continue;
      }
      if (dstX < 0 || dstX + size.width > canvasWidth) {
        continue;
      }

      const srcStart = row * size.width * 4;
      const dstStart = (canvasRow * canvasWidth + dstX) * 4;
      bitmap.copy(buffer, dstStart, srcStart, srcStart + size.width * 4);
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: canvasWidth, height: canvasHeight });
}

function createInitialSessionState(union: ScreenshotSelection, cursorDisplay: Display): ScreenshotSessionState {
  return {
    version: 1,
    union,
    selection: {
      x: cursorDisplay.bounds.x,
      y: cursorDisplay.bounds.y,
      width: cursorDisplay.bounds.width,
      height: cursorDisplay.bounds.height,
    },
    selectionLocked: false,
    annotationColor: "#ff4d4f",
    textFontSize: 22,
    annotations: [],
    redoAnnotations: [],
    status: "单击捕获整屏，移动到窗口可自动吸附，拖拽可手动框选。",
  };
}

function resolveSaveDirectory(userDataPath: string, config: AppConfig["screenshot"]) {
  const customDirectory = config.saveDirectoryPath.trim();
  if (customDirectory && isAbsolute(customDirectory)) {
    return normalize(customDirectory);
  }

  return join(userDataPath, config.saveDirectoryName || "screenshots");
}

function toPublicCapture(record: CaptureRecord): ScreenshotCaptureResult {
  return {
    id: record.id,
    dataUrl: record.dataUrl,
    width: record.width,
    height: record.height,
  };
}

interface SessionBackground {
  width: number;
  height: number;
  dataUrl: string;
}

export function createScreenshotService(options: ScreenshotServiceOptions): ScreenshotService {
  const captures = new Map<string, CaptureRecord>();
  const maxCaptures = options.maxCaptures ?? defaultMaxCaptures;
  let session: ScreenshotSession | undefined;
  let cursorTimer: NodeJS.Timeout | undefined;

  /** Longest edge of the loupe background snapshot per display. */
  const backgroundMaxEdge = 1600;

  /**
   * Captures each display ONCE before the overlays show (so the snapshot is
   * clean) and downscales it for the on-drag magnifier. The overlays stay
   * transparent/live; the loupe samples from this static snapshot.
   */
  async function captureSessionBackgrounds(): Promise<Map<number, SessionBackground>> {
    const backgrounds = new Map<number, SessionBackground>();
    for (const display of screen.getAllDisplays()) {
      const image = await captureDisplay(display);
      if (image.isEmpty()) {
        continue;
      }

      const size = image.getSize();
      const longestEdge = Math.max(size.width, size.height);
      let snapshot = image;
      if (longestEdge > backgroundMaxEdge) {
        const scale = backgroundMaxEdge / longestEdge;
        snapshot = image.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: "best",
        });
      }

      const snapshotSize = snapshot.getSize();
      backgrounds.set(display.id, {
        width: snapshotSize.width,
        height: snapshotSize.height,
        dataUrl: snapshot.toDataURL(),
      });
    }
    return backgrounds;
  }
  let lastCursorUpdate: ScreenshotCursorUpdate | undefined;
  let lastBroadcastState: ScreenshotSessionState | undefined;
  let pendingTargets: Promise<ScreenshotWindowTarget[]> | undefined;

  function sameCursorUpdate(a: ScreenshotCursorUpdate, b: ScreenshotCursorUpdate) {
    return a.x === b.x && a.y === b.y && a.displayId === b.displayId && a.activeOverlayId === b.activeOverlayId;
  }

  /**
   * Polls the cursor in the main process (native call, no IPC round-trip) and
   * pushes only changes to every overlay, replacing per-overlay polling.
   */
  function startCursorPolling() {
    stopCursorPolling();
    cursorTimer = setInterval(() => {
      if (!session || session.overlays.size === 0) {
        stopCursorPolling();
        return;
      }

      const cursor = screen.getCursorScreenPoint();
      const cursorDisplay = findDisplayContainingPoint(screen.getAllDisplays(), cursor) ?? screen.getDisplayNearestPoint(cursor);
      const update: ScreenshotCursorUpdate = {
        x: cursor.x,
        y: cursor.y,
        displayId: cursorDisplay.id,
        activeOverlayId: findActiveOverlayId(cursor, session.overlays),
      };

      if (lastCursorUpdate && sameCursorUpdate(lastCursorUpdate, update)) {
        return;
      }
      lastCursorUpdate = update;

      for (const window of session.overlays.values()) {
        if (window.isDestroyed()) {
          continue;
        }
        window.webContents?.send(ipcChannels.screenshotCursorUpdate, update);
      }
    }, 33);
  }

  function stopCursorPolling() {
    if (cursorTimer) {
      clearInterval(cursorTimer);
      cursorTimer = undefined;
    }
    lastCursorUpdate = undefined;
  }

  function valuesEqual(a: unknown, b: unknown) {
    return a === b || JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Broadcasts only the top-level session fields that changed since the last
   * broadcast (plus the monotonic version), so drags and pen strokes do not
   * re-ship the whole annotations array on every frame.
   */
  function broadcastSession() {
    if (!session) {
      return;
    }

    session.state = { ...session.state, version: session.state.version + 1 };
    const next = session.state;
    const patch: ScreenshotSessionUpdate = { version: next.version };

    if (lastBroadcastState) {
      for (const key of Object.keys(next) as Array<keyof ScreenshotSessionState>) {
        if (key === "version" || key === "union") {
          continue;
        }
        if (!valuesEqual(lastBroadcastState[key], next[key])) {
          (patch as Record<string, unknown>)[key] = next[key];
        }
      }
    } else {
      Object.assign(patch, next);
    }

    lastBroadcastState = { ...next };
    for (const window of session.overlays.values()) {
      if (window.isDestroyed()) {
        continue;
      }
      window.webContents?.send(ipcChannels.screenshotSessionUpdate, patch);
    }
  }

  function refreshWindowTargets(): Promise<ScreenshotWindowTarget[]> {
    if (pendingTargets) {
      return pendingTargets;
    }

    const task = (async () => {
      const displays = screen.getAllDisplays();
      const union = computeUnionBounds(displays);
      const windowTargets = await listScreenshotWindowTargets(union);
      const displayTargets = displays.map((display) => ({
        id: `display-${display.id}`,
        title: "显示器",
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      }));
      const targets = [...windowTargets, ...displayTargets];
      if (session) {
        session.cachedWindowTargets = targets;
      }
      return targets;
    })();

    pendingTargets = task;
    void task.finally(() => {
      if (pendingTargets === task) {
        pendingTargets = undefined;
      }
    });
    return task;
  }

  function invalidateWindowTargets() {
    if (session) {
      session.cachedWindowTargets = undefined;
    }
  }

  function bindOverlayLifecycle(window: BrowserWindow, sessionOverlays: Map<number, BrowserWindow>) {
    sessionOverlays.set(window.id, window);
    window.on("closed", () => {
      sessionOverlays.delete(window.id);
      if (sessionOverlays.size === 0 && session?.overlays === sessionOverlays) {
        session = undefined;
        stopCursorPolling();
        lastBroadcastState = undefined;
        pendingTargets = undefined;
      }
    });
  }

  function createOverlays(preloadPath: string, sessionOverlays: Map<number, BrowserWindow>) {
    for (const display of screen.getAllDisplays()) {
      const window = createScreenshotOverlay({
        preloadPath,
        display,
        rendererIndexPath: options.rendererIndexPath,
      });
      bindOverlayLifecycle(window, sessionOverlays);
    }
  }

  function rebuildSessionOverlays() {
    const current = session;
    if (!current || !current.preloadPath) {
      return;
    }

    // Detach the old overlays so closing them does not tear down the session,
    // then recreate one overlay per display for the new layout.
    const previousOverlays = current.overlays;
    for (const window of previousOverlays.values()) {
      if (!window.isDestroyed()) {
        window.removeAllListeners("closed");
        window.close();
      }
    }

    const sessionOverlays = new Map<number, BrowserWindow>();
    createOverlays(current.preloadPath, sessionOverlays);
    current.overlays = sessionOverlays;
    current.displays = screen.getAllDisplays();
    current.union = computeUnionBounds(current.displays);

    const cursor = screen.getCursorScreenPoint();
    const cursorDisplay = findDisplayContainingPoint(current.displays, cursor) ?? screen.getDisplayNearestPoint(cursor);
    current.activeOverlayId = findActiveOverlayId(cursor, sessionOverlays);
    current.state = {
      ...createInitialSessionState(current.union, cursorDisplay),
      // Keep the user's in-progress annotations across the rebuild.
      annotations: current.state.annotations,
      redoAnnotations: current.state.redoAnnotations,
    };
    invalidateWindowTargets();
    void refreshWindowTargets();
    void captureSessionBackgrounds().then((backgrounds) => {
      if (session === current) {
        current.backgrounds = backgrounds;
      }
    }).catch(() => undefined);
    startCursorPolling();
    broadcastSession();
  }

  screen.on("display-added", () => rebuildSessionOverlays());
  screen.on("display-removed", () => rebuildSessionOverlays());
  screen.on("display-metrics-changed", () => {
    invalidateWindowTargets();
    rebuildSessionOverlays();
  });

  function storeCapture(record: CaptureRecord) {
    captures.set(record.id, record);
    // Evict the oldest captures first so a long session cannot accumulate
    // full-resolution images (and their lazy PNG buffers) unbounded.
    while (captures.size > maxCaptures) {
      const oldestId = captures.keys().next().value;
      if (!oldestId) {
        break;
      }
      captures.delete(oldestId);
    }
  }

  function resolveCapturePng(captureId: string) {
    const capture = getStoredCapture(captureId);
    if (!capture.png) {
      capture.png = capture.image.toPNG();
    }

    return capture.png;
  }
  function closeAllOverlays() {
    if (!session) {
      return;
    }

    for (const window of session.overlays.values()) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
  }

  function cleanupCaptures() {
    const now = Date.now();
    for (const [id, capture] of captures) {
      if (now - capture.createdAt > captureMaxAgeMs) {
        captures.delete(id);
      }
    }
  }

  function getStoredCapture(captureId: string) {
    cleanupCaptures();
    const capture = captures.get(captureId);
    if (!capture) {
      throw new Error("截图已过期，请重新截图。");
    }

    return capture;
  }

  function getVisibleOverlays() {
    if (!session) {
      return [];
    }

    return [...session.overlays.values()].filter((window) => !window.isDestroyed() && window.isVisible());
  }

  function restoreWindows(windows: BrowserWindow[]) {
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });
  }

  async function captureDisplay(display: Display) {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: getCaptureThumbnailSize(display),
    });
    const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
    return source?.thumbnail ?? nativeImage.createEmpty();
  }

  return {
    async startAreaCapture(preloadPath) {
      closeAllOverlays();

      // Capture clean per-display snapshots BEFORE the overlays show; the
      // magnifier (loupe) samples from these during selection drags. Failures
      // degrade gracefully: the loupe is simply unavailable for this session.
      let backgrounds: Map<number, SessionBackground> | undefined;
      try {
        backgrounds = await captureSessionBackgrounds();
      } catch {
        backgrounds = undefined;
      }

      const displays = screen.getAllDisplays();
      const union = computeUnionBounds(displays);
      const sessionOverlays = new Map<number, BrowserWindow>();
      createOverlays(preloadPath, sessionOverlays);
      const windows = [...sessionOverlays.values()];

      const cursor = screen.getCursorScreenPoint();
      const cursorDisplay = findDisplayContainingPoint(displays, cursor) ?? screen.getDisplayNearestPoint(cursor);
      session = {
        overlays: sessionOverlays,
        displays,
        union,
        preloadPath,
        backgrounds,
        state: createInitialSessionState(union, cursorDisplay),
      };
      session.activeOverlayId = findActiveOverlayId(cursor, sessionOverlays);
      // Enumerate window targets once per session; every overlay shares the
      // cached list instead of each spawning a PowerShell process.
      void refreshWindowTargets();
      startCursorPolling();
      broadcastSession();
      return windows;
    },

    async captureSelection(sourceWindow, selection, captureOptions) {
      if (!isUsableSelection(selection)) {
        throw new Error("截图区域太小，请重新框选。");
      }

      // Selection is in absolute virtual-desktop DIP coordinates. Clip it to
      // every display it touches; each piece is captured at that display's
      // native physical resolution.
      const displays = screen.getAllDisplays();
      const pieces: Array<{ display: Display; clipped: ScreenshotSelection }> = [];
      for (const display of displays) {
        const clipped = toDisplaySelection(selection, display);
        if (hasVisibleSelection(clipped)) {
          pieces.push({ display, clipped });
        }
      }

      if (pieces.length === 0) {
        throw new Error("截图区域太小，请重新框选。");
      }

      const hiddenOverlays = getVisibleOverlays();
      hiddenOverlays.forEach((window) => window.hide());
      let shouldRestoreOverlays = captureOptions?.restoreOverlay !== false;
      await wait(captureOptions?.delayMs ?? 90);

      try {
        const union = computeUnionBounds(displays);
        const capturedPieces: Array<{ image: NativeImage; display: Display; clipped: ScreenshotSelection; cropRect: Rectangle }> = [];

        for (const piece of pieces) {
          const image = await captureDisplay(piece.display);
          const imageSize = image.getSize();

          if (image.isEmpty() || imageSize.width <= 0 || imageSize.height <= 0) {
            throw new Error("屏幕捕获失败，请重试。");
          }

          const cropRect = scaleSelectionToImageRect(
            piece.clipped,
            { width: piece.display.bounds.width, height: piece.display.bounds.height },
            imageSize,
          );
          const cropped = image.crop(cropRect);
          const croppedSize = cropped.getSize();
          if (cropped.isEmpty() || croppedSize.width <= 0 || croppedSize.height <= 0) {
            throw new Error("屏幕捕获失败，请重试。");
          }

          capturedPieces.push({ image: cropped, display: piece.display, clipped: piece.clipped, cropRect });
        }

        let finalImage: NativeImage;
        if (capturedPieces.length === 1) {
          const { image, display, clipped } = capturedPieces[0];
          const destination: ImageSize = {
            width: Math.max(1, Math.round(clipped.width * display.scaleFactor)),
            height: Math.max(1, Math.round(clipped.height * display.scaleFactor)),
          };
          finalImage = resizeImageToDestination(image, destination);
        } else {
          finalImage = stitchDisplayPieces(
            capturedPieces,
            union,
            screen.getPrimaryDisplay().scaleFactor,
          );
        }

        const finalSize = finalImage.getSize();
        const id = createCaptureId();
        const record: CaptureRecord = {
          id,
          dataUrl: createPreviewDataUrl(finalImage),
          width: finalSize.width,
          height: finalSize.height,
          image: finalImage,
          createdAt: Date.now(),
        };

        storeCapture(record);
        for (const overlay of session?.overlays?.values() ?? []) {
          if (overlay !== sourceWindow && !overlay.isDestroyed()) {
            overlay.close();
          }
        }

        return toPublicCapture(record);
      } catch (error) {
        shouldRestoreOverlays = true;
        throw error;
      } finally {
        if (shouldRestoreOverlays) {
          restoreWindows(hiddenOverlays);
        }
      }
    },

    updateCapture(captureId, dataUrl) {
      const capture = getStoredCapture(captureId);
      const image = nativeImage.createFromDataURL(dataUrl);
      const imageSize = image.getSize();

      if (image.isEmpty() || imageSize.width <= 0 || imageSize.height <= 0) {
        throw new Error("更新后的截图无效，请重新截图。");
      }

      const nextRecord: CaptureRecord = {
        id: capture.id,
        dataUrl: createPreviewDataUrl(image),
        width: imageSize.width,
        height: imageSize.height,
        image,
        createdAt: Date.now(),
      };
      captures.set(captureId, nextRecord);
      return toPublicCapture(nextRecord);
    },

    copyCapture(captureId) {
      clipboard.writeImage(getStoredCapture(captureId).image);
    },

    saveCapture(captureId, config) {
      const capture = getStoredCapture(captureId);
      const directory = resolveSaveDirectory(options.userDataPath, config);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
      }

      const format = config.saveFormat ?? "png";
      const extension = format === "jpeg" ? "jpg" : format;
      const filePath = join(
        directory,
        createScreenshotFilename(config.filenamePattern || "lacritomato-yyyyMMdd-HHmmss", new Date(), extension),
      );
      const quality = config.jpegQuality ?? 92;
      const bytes = format === "jpeg"
        ? capture.image.toJPEG(quality)
        : resolveCapturePng(captureId);
      writeFileSync(filePath, bytes);
      return { filePath };
    },

    getCapture(captureId) {
      const capture = captures.get(captureId);
      return capture ? toPublicCapture(capture) : undefined;
    },

    async listWindowTargets() {
      if (session?.cachedWindowTargets) {
        return session.cachedWindowTargets;
      }

      return refreshWindowTargets();
    },

    getCapturePng(captureId) {
      return resolveCapturePng(captureId);
    },

    getCaptureImage(captureId) {
      // Transient full-resolution fetch (e.g. annotation flattening); unlike
      // getCapturePng it does not pin a PNG buffer in memory for the TTL.
      return getStoredCapture(captureId).image.toPNG();
    },

    getBackground(displayId) {
      return session?.backgrounds?.get(displayId);
    },

    getCursorSession(requestingWindow) {
      const displays = screen.getAllDisplays();
      const cursor = screen.getCursorScreenPoint();
      const cursorDisplay = findDisplayContainingPoint(displays, cursor) ?? screen.getDisplayNearestPoint(cursor);

      if (!session) {
        let displaySize: ImageSize;
        if (requestingWindow && !requestingWindow.isDestroyed()) {
          const bounds = requestingWindow.getBounds();
          const windowDisplay = displays.find((display) => (
            bounds.x >= display.bounds.x
            && bounds.y >= display.bounds.y
            && bounds.x + bounds.width <= display.bounds.x + display.bounds.width
            && bounds.y + bounds.height <= display.bounds.y + display.bounds.height
          )) ?? cursorDisplay;
          displaySize = { width: windowDisplay.bounds.width, height: windowDisplay.bounds.height };
        } else {
          displaySize = { width: cursorDisplay.bounds.width, height: cursorDisplay.bounds.height };
        }

        return {
          x: cursor.x,
          y: cursor.y,
          displayId: cursorDisplay.id,
          displaySize,
        };
      }

      session.activeOverlayId = findActiveOverlayId(cursor, session.overlays);
      return {
        x: cursor.x,
        y: cursor.y,
        displayId: cursorDisplay.id,
        activeOverlayId: session.activeOverlayId,
        displaySize: { width: session.union.width, height: session.union.height },
        session: session.state,
      };
    },

    reportSession(update) {
      if (!session) {
        return;
      }

      const nextState: ScreenshotSessionState = { ...session.state, ...update };
      // Ignore no-op reports so broadcast echoes never loop back into reports.
      const same = JSON.stringify({ ...session.state, version: 0 }) === JSON.stringify({ ...nextState, version: 0 });
      if (same) {
        return;
      }

      session.state = nextState;
      broadcastSession();
    },

    closeAllOverlays,
  };
}