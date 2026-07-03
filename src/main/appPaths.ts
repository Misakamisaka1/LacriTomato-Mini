import { join } from "node:path";

export interface AppResourcePaths {
  preloadPath: string;
  rendererIndexPath: string;
  trayIconPath: string;
  trainedDataPath: string;
  ffmpegPath: string;
  wasapiLoopbackHelperPath: string;
}

export function createAppResourcePaths(appRoot: string): AppResourcePaths {
  return {
    preloadPath: join(appRoot, "dist/preload/index.cjs"),
    rendererIndexPath: join(appRoot, "dist/renderer/index.html"),
    trayIconPath: join(appRoot, "assets/pet/tray-icon.png"),
    trainedDataPath: appRoot,
    ffmpegPath: join(appRoot, "assets/recording/ffmpeg.exe"),
    wasapiLoopbackHelperPath: join(appRoot, "assets/recording/wasapi-loopback-helper.exe"),
  };
}