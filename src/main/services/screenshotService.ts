import { BrowserWindow, clipboard, desktopCapturer, nativeImage, screen, type Display, type NativeImage, type Rectangle } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import type { AppConfig } from "../../shared/configSchema.js";
import { createScreenshotOverlay } from "../windows/createScreenshotOverlay.js";
import {
  createScreenshotFilename,
  type ImageSize,
  isUsableSelection,
  scaleSelectionToImageRect,
  type ScreenshotCaptureOptions,
  type ScreenshotCaptureResult,
  type ScreenshotSaveResult,
  type ScreenshotSelection,
  type ScreenshotWindowTarget,
} from "../../plugins/screenshot/workflow.js";
import { listScreenshotWindowTargets } from "./windowTargetService.js";

interface CaptureRecord extends ScreenshotCaptureResult {
  image: NativeImage;
  png: Buffer;
  createdAt: number;
}

export interface ScreenshotServiceOptions {
  userDataPath: string;
  rendererIndexPath?: string;
}

export interface ScreenshotService {
  startAreaCapture(preloadPath: string): Promise<BrowserWindow[]>;
  capturePrimaryDisplay(): Promise<NativeImage>;
  captureSelection(sourceWindow: BrowserWindow, selection: ScreenshotSelection, options?: ScreenshotCaptureOptions): Promise<ScreenshotCaptureResult>;
  updateCapture(captureId: string, dataUrl: string): ScreenshotCaptureResult;
  copyCapture(captureId: string): void;
  saveCapture(captureId: string, config: AppConfig["screenshot"]): ScreenshotSaveResult;
  getCapture(captureId: string): ScreenshotCaptureResult | undefined;
  listWindowTargets(sourceWindow: BrowserWindow): Promise<ScreenshotWindowTarget[]>;
  getCapturePng(captureId: string): Buffer;
}

const captureMaxAgeMs = 1000 * 60 * 30;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function toAbsoluteSelection(windowBounds: Rectangle, selection: ScreenshotSelection): Rectangle {
  return {
    x: windowBounds.x + selection.x,
    y: windowBounds.y + selection.y,
    width: selection.width,
    height: selection.height,
  };
}

function getVirtualDesktopBounds(displays: Display[]): Rectangle {
  const availableDisplays = displays.length > 0 ? displays : [screen.getPrimaryDisplay()];
  const left = Math.min(...availableDisplays.map((display) => display.bounds.x));
  const top = Math.min(...availableDisplays.map((display) => display.bounds.y));
  const right = Math.max(...availableDisplays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...availableDisplays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
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

function createCaptureDestination(absoluteSelection: Rectangle, display: Display, displaySelection: ScreenshotSelection): Rectangle {
  return {
    x: Math.round(display.bounds.x + displaySelection.x - absoluteSelection.x),
    y: Math.round(display.bounds.y + displaySelection.y - absoluteSelection.y),
    width: Math.round(displaySelection.width),
    height: Math.round(displaySelection.height),
  };
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

function composeDisplayCaptures(parts: Array<{ image: NativeImage; destination: Rectangle }>, outputSize: ImageSize) {
  const width = Math.max(1, Math.round(outputSize.width));
  const height = Math.max(1, Math.round(outputSize.height));
  const bytesPerPixel = 4;
  const output = Buffer.alloc(width * height * bytesPerPixel);

  for (const part of parts) {
    const imageSize = part.image.getSize();
    const source = part.image.toBitmap();
    const copyWidth = Math.max(0, Math.min(imageSize.width, width - part.destination.x));
    const copyHeight = Math.max(0, Math.min(imageSize.height, height - part.destination.y));

    for (let y = 0; y < copyHeight; y += 1) {
      const sourceStart = y * imageSize.width * bytesPerPixel;
      const sourceEnd = sourceStart + copyWidth * bytesPerPixel;
      const destinationStart = ((part.destination.y + y) * width + part.destination.x) * bytesPerPixel;
      source.copy(output, destinationStart, sourceStart, sourceEnd);
    }
  }

  return nativeImage.createFromBitmap(output, { width, height });
}

function createDisplayFallbackTargets(displays: Display[], overlayBounds: Rectangle): ScreenshotWindowTarget[] {
  return displays.flatMap((display, index) => {
    const left = Math.max(display.bounds.x, overlayBounds.x);
    const top = Math.max(display.bounds.y, overlayBounds.y);
    const right = Math.min(display.bounds.x + display.bounds.width, overlayBounds.x + overlayBounds.width);
    const bottom = Math.min(display.bounds.y + display.bounds.height, overlayBounds.y + overlayBounds.height);
    const width = Math.round(right - left);
    const height = Math.round(bottom - top);

    if (width < 32 || height < 32) {
      return [];
    }

    return [{
      id: `display-${display.id}`,
      title: `显示器 ${index + 1}`,
      x: Math.round(left - overlayBounds.x),
      y: Math.round(top - overlayBounds.y),
      width,
      height,
    }];
  });
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

export function createScreenshotService(options: ScreenshotServiceOptions): ScreenshotService {
  const overlays = new Set<BrowserWindow>();
  const captures = new Map<string, CaptureRecord>();

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
    return [...overlays].filter((window) => !window.isDestroyed() && window.isVisible());
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
      const window = createScreenshotOverlay(preloadPath, getVirtualDesktopBounds(screen.getAllDisplays()), options.rendererIndexPath);
      overlays.add(window);
      window.on("closed", () => overlays.delete(window));
      return [window];
    },
    async capturePrimaryDisplay() {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: primary.size,
      });
      return sources[0]?.thumbnail ?? nativeImage.createEmpty();
    },
    async captureSelection(sourceWindow, selection, captureOptions) {
      if (!isUsableSelection(selection)) {
        throw new Error("截图区域太小，请重新框选。");
      }

      const windowBounds = sourceWindow.getBounds();
      const absoluteSelection = toAbsoluteSelection(windowBounds, selection);
      const captureRegions = screen.getAllDisplays()
        .map((display) => ({
          display,
          selection: toDisplaySelection(absoluteSelection, display),
        }))
        .filter((region) => hasVisibleSelection(region.selection));

      if (captureRegions.length === 0) {
        throw new Error("截图区域太小，请重新框选。");
      }

      const hiddenOverlays = getVisibleOverlays();
      hiddenOverlays.forEach((window) => window.hide());
      let shouldRestoreOverlays = captureOptions?.restoreOverlay !== false;
      await wait(90);

      try {
        const parts: Array<{ image: NativeImage; destination: Rectangle }> = [];
        for (const region of captureRegions) {
          const image = await captureDisplay(region.display);
          const imageSize = image.getSize();

          if (image.isEmpty() || imageSize.width <= 0 || imageSize.height <= 0) {
            throw new Error("屏幕捕获失败，请重试。");
          }

          const cropRect = scaleSelectionToImageRect(
            region.selection,
            { width: region.display.bounds.width, height: region.display.bounds.height },
            imageSize,
          );
          const destination = createCaptureDestination(absoluteSelection, region.display, region.selection);
          const cropped = resizeImageToDestination(image.crop(cropRect), destination);
          parts.push({ image: cropped, destination });
        }

        const cropped = composeDisplayCaptures(parts, {
          width: absoluteSelection.width,
          height: absoluteSelection.height,
        });
        const croppedSize = cropped.getSize();
        const id = createCaptureId();
        const record: CaptureRecord = {
          id,
          dataUrl: cropped.toDataURL(),
          width: croppedSize.width,
          height: croppedSize.height,
          image: cropped,
          png: cropped.toPNG(),
          createdAt: Date.now(),
        };

        captures.set(id, record);
        for (const overlay of overlays) {
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
        ...capture,
        dataUrl: image.toDataURL(),
        width: imageSize.width,
        height: imageSize.height,
        image,
        png: image.toPNG(),
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

      const filePath = join(directory, createScreenshotFilename(config.filenamePattern || "lacritomato-yyyyMMdd-HHmmss"));
      writeFileSync(filePath, capture.png);
      return { filePath };
    },
    getCapture(captureId) {
      const capture = captures.get(captureId);
      return capture ? toPublicCapture(capture) : undefined;
    },
    async listWindowTargets(_sourceWindow) {
      const overlayBounds = getVirtualDesktopBounds(screen.getAllDisplays());
      const windowTargets = await listScreenshotWindowTargets(overlayBounds);
      return [
        ...windowTargets,
        ...createDisplayFallbackTargets(screen.getAllDisplays(), overlayBounds),
      ];
    },
    getCapturePng(captureId) {
      return getStoredCapture(captureId).png;
    },
  };
}
