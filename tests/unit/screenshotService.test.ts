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
    once: ReturnType<typeof vi.fn>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    setFullScreen: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  function createImage(width: number, height: number, label = "image") {
    const image = {
      crop: vi.fn((rect: Bounds) => createImage(rect.width, rect.height, `${label}-crop`)),
      resize: vi.fn((options: { width: number; height: number }) => createImage(options.width, options.height, `${label}-resize`)),
      getSize: vi.fn(() => ({ width, height })),
      isEmpty: vi.fn(() => false),
      toBitmap: vi.fn(() => Buffer.alloc(Math.max(1, width * height * 4), label.charCodeAt(0))),
      toDataURL: vi.fn(() => `data:image/png;base64,${Buffer.from(label).toString("base64")}`),
      toJPEG: vi.fn(() => Buffer.from(`${label}-jpeg`)),
      toPNG: vi.fn(() => Buffer.from(label)),
    };
    return image;
  }

  let nextWindowId = 1;
  const BrowserWindow = vi.fn((options: Bounds & { enableLargerThanScreen?: boolean }) => {
    const window = {
      id: nextWindowId,
      options,
      getBounds: vi.fn(() => ({ x: options.x, y: options.y, width: options.width, height: options.height })),
      hide: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      loadFile: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      setFullScreen: vi.fn(),
      show: vi.fn(),
      close: vi.fn(),
    };
    nextWindowId += 1;
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
    on: vi.fn((event: string, listener: () => void) => {
      displayEventListeners.set(event, listener);
    }),
  };

  const displayEventListeners = new Map<string, () => void>();

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
    displayEventListeners,
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
    // Session startup captures a background snapshot per display; default to an
    // empty source list so unrelated tests do not need per-call mocks.
    electronMock.desktopCapturer.getSources.mockResolvedValue([]);
  });

  it("creates one overlay per display so each screen gets its own capture window", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp", rendererIndexPath: "renderer.html" });

    const windows = await service.startAreaCapture("preload.js");

    expect(windows).toHaveLength(2);
    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(2);
    // First overlay covers display 1
    expect(electronMock.instances[0].options).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 });
    // Second overlay covers display 2
    expect(electronMock.instances[1].options).toMatchObject({ x: 1920, y: 0, width: 1280, height: 1024 });
  });

  it("reports window targets across every display in absolute coordinates", async () => {
    windowTargetMock.listScreenshotWindowTargets.mockResolvedValueOnce([
      { id: "window-1", title: "浏览器", x: 1950, y: 60, width: 400, height: 300 },
    ]);
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });

    await expect(service.listWindowTargets()).resolves.toEqual([
      { id: "window-1", title: "浏览器", x: 1950, y: 60, width: 400, height: 300 },
      { id: "display-1", title: "显示器", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    // Should clip to the whole virtual desktop, not a single display
    expect(windowTargetMock.listScreenshotWindowTargets).toHaveBeenCalledWith({ x: 0, y: 0, width: 3200, height: 1080 });
  });

  it("captures a selection on the second display using absolute virtual-desktop coordinates", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const secondaryImage = electronMock.createImage(1280, 1024, "secondary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "2", thumbnail: secondaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 1920, y: 0, width: 1280, height: 1024 }),
    };

    // Absolute selection: local x=80 on display 2 means absolute x=2000
    const result = await service.captureSelection(overlayWindow as never, { x: 2000, y: 100, width: 100, height: 80 });

    expect(electronMock.desktopCapturer.getSources).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailSize: { width: 1280, height: 1024 },
    }));
    expect(secondaryImage.crop).toHaveBeenCalledWith({ x: 80, y: 100, width: 100, height: 80 });
    expect(result).toMatchObject({ width: 100, height: 80 });
  });

  it("stitches a selection that spans both displays into one image", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    const secondaryImage = electronMock.createImage(1280, 1024, "secondary");
    electronMock.desktopCapturer.getSources
      .mockResolvedValueOnce([{ display_id: "1", thumbnail: primaryImage }])
      .mockResolvedValueOnce([{ display_id: "2", thumbnail: secondaryImage }]);
    const overlayWindow = {
      getBounds: () => ({ x: 1920, y: 0, width: 1280, height: 1024 }),
    };

    // Spanning selection: from display 1 into display 2 (absolute coords)
    const result = await service.captureSelection(overlayWindow as never, { x: 0, y: 0, width: 3200, height: 1080 });

    expect(electronMock.desktopCapturer.getSources).toHaveBeenCalledTimes(2);
    expect(electronMock.nativeImage.createFromBitmap).toHaveBeenCalledWith(
      expect.any(Buffer),
      { width: 3200, height: 1080 },
    );
    expect(result).toMatchObject({ width: 3200, height: 1080 });
  });

  it("does not eagerly encode the full-resolution PNG on capture", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "1", thumbnail: primaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    };

    const capture = await service.captureSelection(overlayWindow as never, { x: 10, y: 20, width: 100, height: 80 });
    const croppedImage = primaryImage.crop.mock.results[0].value;

    // The capture path must not run the expensive full-res PNG encode.
    expect(croppedImage.toPNG).not.toHaveBeenCalled();

    // PNG is produced lazily on first demand and then cached.
    service.getCapturePng(capture.id);
    expect(croppedImage.toPNG).toHaveBeenCalledTimes(1);
    service.getCapturePng(capture.id);
    expect(croppedImage.toPNG).toHaveBeenCalledTimes(1);
  });

  it("serves transient full-resolution images without caching the PNG buffer", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "1", thumbnail: primaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    };

    const capture = await service.captureSelection(overlayWindow as never, { x: 10, y: 20, width: 100, height: 80 });
    const croppedImage = primaryImage.crop.mock.results[0].value;

    expect(service.getCaptureImage(capture.id)).toBeInstanceOf(Buffer);
    expect(service.getCaptureImage(capture.id)).toBeInstanceOf(Buffer);
    // Unlike getCapturePng, the transient fetch always re-encodes (no cache).
    expect(croppedImage.toPNG).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest captures when the session exceeds the configured limit", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp", maxCaptures: 2 });
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    };
    const captureIds: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const image = electronMock.createImage(320, 240, `capture-${index}`);
      electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
        { display_id: "1", thumbnail: image },
      ]);
      const result = await service.captureSelection(overlayWindow as never, { x: 10, y: 20, width: 100, height: 80 });
      captureIds.push(result.id);
    }

    // Oldest capture was evicted; the two newest survive.
    expect(service.getCapture(captureIds[0])).toBeUndefined();
    expect(service.getCapture(captureIds[1])).toBeDefined();
    expect(service.getCapture(captureIds[2])).toBeDefined();
  });

  it("rebuilds overlays when the display layout changes mid-session", async () => {
    const service = createScreenshotService({ userDataPath: "C:\\tmp", rendererIndexPath: "renderer.html" });
    const firstBatch = await service.startAreaCapture("preload.js");
    expect(firstBatch).toHaveLength(2);

    electronMock.displays.push({
      id: 3,
      bounds: { x: 0, y: 1080, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    });
    electronMock.screen.getAllDisplays.mockReturnValue(electronMock.displays);

    const displayAdded = electronMock.displayEventListeners.get("display-added");
    expect(displayAdded).toBeDefined();
    displayAdded?.();

    // Old overlays were closed and replaced by one per new display.
    expect(electronMock.instances[0].close).toHaveBeenCalledTimes(1);
    expect(electronMock.instances[1].close).toHaveBeenCalledTimes(1);
    expect(electronMock.instances).toHaveLength(5);
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

  it("saves captures as JPEG when the save format is configured", async () => {
    fsMock.existsSync.mockReturnValue(false);
    const service = createScreenshotService({ userDataPath: "C:\\\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "1", thumbnail: primaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    };

    const capture = await service.captureSelection(overlayWindow as never, { x: 10, y: 20, width: 100, height: 80 });
    const config = {
      ...defaultAppConfig.screenshot,
      saveFormat: "jpeg" as const,
      jpegQuality: 85,
    };
    const result = service.saveCapture(capture.id, config);

    const croppedImage = primaryImage.crop.mock.results[0].value;
    expect(croppedImage.toJPEG).toHaveBeenCalledWith(85);
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), Buffer.from("primary-crop-jpeg"));
    expect(result.filePath.endsWith(".jpg")).toBe(true);
  });

  it("saves captures to the selected custom screenshot directory", async () => {
    fsMock.existsSync.mockReturnValue(false);
    const service = createScreenshotService({ userDataPath: "C:\\\\tmp" });
    const primaryImage = electronMock.createImage(1920, 1080, "primary");
    electronMock.desktopCapturer.getSources.mockResolvedValueOnce([
      { display_id: "1", thumbnail: primaryImage },
    ]);
    const overlayWindow = {
      getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
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
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(result.filePath, expect.any(Buffer));
  });
});
