import { beforeEach, describe, expect, it, vi } from "vitest";
import { join, sep } from "node:path";
import { createScreenshotService } from "../../src/main/services/screenshotService";
import { defaultAppConfig, type AppConfig } from "../../src/shared/configSchema";

const electronMock = vi.hoisted(() => {
  type Bounds = { x: number; y: number; width: number; height: number };
  type Display = { id: number; bounds: Bounds; size: { width: number; height: number }; scaleFactor: number };

  const displays: Display[] = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, size: { width: 1280, height: 1024 }, scaleFactor: 1 },
  ];
  const instances: Array<{
    options: Bounds & { enableLargerThanScreen?: boolean };
    getBounds: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    loadFile: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
  }> = [];

  function createImage(width: number, height: number, label = "image") {
    const image = {
      crop: vi.fn((rect: Bounds) => createImage(rect.width, rect.height, `${label}-crop`)),
      resize: vi.fn((options: { width: number; height: number }) => createImage(options.width, options.height, `${label}-resize`)),
      getSize: vi.fn(() => ({ width, height })),
      isEmpty: vi.fn(() => false),
      toBitmap: vi.fn(() => Buffer.alloc(Math.max(1, width * height * 4), label.charCodeAt(0))),
      toDataURL: vi.fn(() => `data:image/png;base64,${Buffer.from(label).toString("base64")}`),
      toPNG: vi.fn(() => Buffer.from(label)),
    };
    return image;
  }

  const BrowserWindow = vi.fn((options: Bounds & { enableLargerThanScreen?: boolean }) => {
    const window = {
      options,
      getBounds: vi.fn(() => ({ x: options.x, y: options.y, width: options.width, height: options.height })),
      hide: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      loadFile: vi.fn(),
      on: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      show: vi.fn(),
    };
    instances.push(window);
    return window;
  });

  const desktopCapturer = {
    getSources: vi.fn(),
  };

  function displayNearestPoint(point: { x: number; y: number }) {
    return point.x >= displays[1].bounds.x ? displays[1] : displays[0];
  }

  const screen = {
    getAllDisplays: vi.fn(() => displays),
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 120 })),
    getDisplayMatching: vi.fn(() => displays[0]),
    getDisplayNearestPoint: vi.fn(displayNearestPoint),
    getPrimaryDisplay: vi.fn(() => displays[0]),
  };

  return {
    BrowserWindow,
    clipboard: { writeImage: vi.fn() },
    createImage,
    desktopCapturer,
    displays,
    instances,
    nativeImage: {
      createEmpty: vi.fn(() => createImage(1, 1, "empty")),
      createFromBitmap: vi.fn((_buffer: Buffer, options: { width: number; height: number }) => createImage(options.width, options.height, "composite")),
      createFromDataURL: vi.fn(() => createImage(100, 80, "updated")),
    },
    screen,
  };
});

const windowTargetMock = vi.hoisted(() => ({
  listScreenshotWindowTargets: vi.fn(),
}));

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../../src/main/services/windowTargetService", () => ({
  listScreenshotWindowTargets: windowTargetMock.listScreenshotWindowTargets,
}));
vi.mock("node:fs", () => ({ ...fsMock, default: fsMock }));
vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  clipboard: electronMock.clipboard,
  desktopCapturer: electronMock.desktopCapturer,
  nativeImage: electronMock.nativeImage,
  screen: electronMock.screen,
}));

describe("screenshot service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.instances.length = 0;
    electronMock.screen.getAllDisplays.mockReturnValue(electronMock.displays);
    electronMock.screen.getCursorScreenPoint.mockReturnValue({ x: 100, y: 120 });
    electronMock.screen.getDisplayMatching.mockReturnValue(electronMock.displays[0]);
    electronMock.screen.getDisplayNearestPoint.mockImplementation((point) => point.x >= 1920 ? electronMock.displays[1] : electronMock.displays[0]);
    electronMock.screen.getPrimaryDisplay.mockReturnValue(electronMock.displays[0]);
    fsMock.existsSync.mockReturnValue(true);
    windowTargetMock.listScreenshotWindowTargets.mockResolvedValue([]);
  });

  it("creates one overlay over the virtual desktop so selections can span displays", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp", rendererIndexPath: "renderer.html" });

    const windows = await service.startAreaCapture("preload.js");

    expect(windows).toHaveLength(1);
    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(1);
    expect(electronMock.instances[0].options).toMatchObject({ x: 0, y: 0, width: 3200, height: 1080 });
  });

  it("adds display fallback targets in virtual desktop coordinates after native window targets", async () => {
    windowTargetMock.listScreenshotWindowTargets.mockResolvedValueOnce([
      { id: "window-1", title: "浏览器", x: 50, y: 60, width: 400, height: 300 },
    ]);
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 3200, height: 1080 }),
    };

    await expect(service.listWindowTargets(overlayWindow as never)).resolves.toEqual([
      { id: "window-1", title: "浏览器", x: 50, y: 60, width: 400, height: 300 },
      { id: "display-1", title: "显示器 1", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器 2", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    expect(windowTargetMock.listScreenshotWindowTargets).toHaveBeenCalledWith({ x: 0, y: 0, width: 3200, height: 1080 });
  });

  it("captures a selection on the second display using virtual desktop coordinates", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const secondaryImage = electronMock.createImage(1280, 1024, "secondary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "2", thumbnail: secondaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 3200, height: 1080 }),
    };

    await service.captureSelection(overlayWindow as never, { x: 2000, y: 100, width: 100, height: 80 });

    expect(electronMock.desktopCapturer.getSources).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailSize: { width: 1280, height: 1024 },
    }));
    expect(secondaryImage.crop).toHaveBeenCalledWith({ x: 80, y: 100, width: 100, height: 80 });
    expect(electronMock.nativeImage.createFromBitmap).toHaveBeenCalledWith(expect.any(Buffer), { width: 100, height: 80 });
  });

  it("composes a cross-display selection into one long capture", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    const secondaryImage = electronMock.createImage(1280, 1024, "secondary");
    electronMock.desktopCapturer.getSources
      .mockResolvedValueOnce([{ display_id: "1", thumbnail: primaryImage }])
      .mockResolvedValueOnce([{ display_id: "2", thumbnail: secondaryImage }]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 3200, height: 1080 }),
    };

    const result = await service.captureSelection(overlayWindow as never, { x: 1800, y: 100, width: 300, height: 80 });

    expect(primaryImage.crop).toHaveBeenCalledWith({ x: 1800, y: 100, width: 120, height: 80 });
    expect(secondaryImage.crop).toHaveBeenCalledWith({ x: 0, y: 100, width: 180, height: 80 });
    expect(electronMock.nativeImage.createFromBitmap).toHaveBeenCalledWith(expect.any(Buffer), { width: 300, height: 80 });
    expect(result).toMatchObject({ width: 300, height: 80 });
  });

  it("keeps the overlay hidden after confirm capture to avoid a visible flash", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp", rendererIndexPath: "renderer.html" });
    const [overlayWindow] = await service.startAreaCapture("preload.js");
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "1", thumbnail: primaryImage },
    ]);

    await service.captureSelection(overlayWindow, { x: 10, y: 20, width: 100, height: 80 }, { restoreOverlay: false });

    expect(electronMock.instances[0].hide).toHaveBeenCalledTimes(1);
    expect(electronMock.instances[0].show).not.toHaveBeenCalled();
  });

  it("saves captures to the selected custom screenshot directory", async () => {
    fsMock.existsSync.mockReturnValue(false);
    const service = createScreenshotService({ userDataPath: "C:\\\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "1", thumbnail: primaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 3200, height: 1080 }),
    };

    const capture = await service.captureSelection(overlayWindow as never, { x: 10, y: 20, width: 100, height: 80 });
    const config = {
      ...defaultAppConfig.screenshot,
      saveDirectoryPath: "D:/captures/screenshots",
    } as AppConfig["screenshot"];
    const result = service.saveCapture(capture.id, config);
    const expectedDirectory = join("D:/captures/screenshots");

    expect(fsMock.mkdirSync).toHaveBeenCalledWith(expectedDirectory, { recursive: true });
    expect(result.filePath.startsWith(`${expectedDirectory}${sep}`)).toBe(true);
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(result.filePath, Buffer.from("composite"));
  });
});