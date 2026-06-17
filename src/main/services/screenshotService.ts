import { BrowserWindow, desktopCapturer, nativeImage, screen, type NativeImage } from "electron";
import { createScreenshotOverlay } from "../windows/createScreenshotOverlay.js";

export interface ScreenshotService {
  startAreaCapture(preloadPath: string): Promise<BrowserWindow[]>;
  capturePrimaryDisplay(): Promise<NativeImage>;
}

export function createScreenshotService(): ScreenshotService {
  return {
    async startAreaCapture(preloadPath) {
      return screen.getAllDisplays().map((display) => createScreenshotOverlay(preloadPath, display.bounds));
    },
    async capturePrimaryDisplay() {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: primary.size,
      });
      return sources[0]?.thumbnail ?? nativeImage.createEmpty();
    },
  };
}
