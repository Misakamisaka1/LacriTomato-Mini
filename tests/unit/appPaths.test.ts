import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAppResourcePaths } from "../../src/main/appPaths";

describe("app resource paths", () => {
  it("resolves runtime assets from the Electron app root instead of the launch working directory", () => {
    const appRoot = join("C:", "Program Files", "LacriTomato Mini", "resources", "app.asar");

    expect(createAppResourcePaths(appRoot)).toEqual({
      preloadPath: join(appRoot, "dist/preload/index.cjs"),
      rendererIndexPath: join(appRoot, "dist/renderer/index.html"),
      trayIconPath: join(appRoot, "assets/pet/tray-icon.png"),
      trainedDataPath: appRoot,
      ffmpegPath: join(appRoot, "assets/recording/ffmpeg.exe"),
      wasapiLoopbackHelperPath: join(appRoot, "assets/recording/wasapi-loopback-helper.exe"),
    });
  });
});