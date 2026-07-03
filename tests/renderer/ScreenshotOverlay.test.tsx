import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotOverlay } from "../../src/plugins/screenshot/renderer/ScreenshotOverlay";

const writeClipboardText = vi.fn().mockResolvedValue(undefined);

const screenshotApi = {
  captureSelection: vi.fn().mockResolvedValue({
    id: "capture-1",
    dataUrl: "data:image/png;base64,ZmFrZQ==",
    width: 70,
    height: 80,
  }),
  updateCapture: vi.fn().mockResolvedValue({
    id: "capture-1",
    dataUrl: "data:image/png;base64,ZmFrZQ==",
    width: 70,
    height: 80,
  }),
  copyCapture: vi.fn().mockResolvedValue(undefined),
  saveCapture: vi.fn().mockResolvedValue({ filePath: "C:\\tmp\\capture.png" }),
  ocrCapture: vi.fn().mockResolvedValue({ text: "识别文本", confidence: 91 }),
  pinCapture: vi.fn().mockResolvedValue(undefined),
  getCapture: vi.fn(),
  listWindowTargets: vi.fn().mockResolvedValue([]),
  getCursorPoint: vi.fn(),
  showTip: vi.fn().mockResolvedValue(undefined),
  closeOverlay: vi.fn().mockResolvedValue(undefined),
};

async function lockSelection(container: HTMLElement) {
  const overlay = container.querySelector(".screenshot-overlay") as HTMLElement;

  if (!overlay) {
    throw new Error("Screenshot overlay was not rendered");
  }

  await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
  fireEvent.mouseDown(overlay, { clientX: 10, clientY: 20 });
  fireEvent.mouseMove(overlay, { clientX: 80, clientY: 100 });
  fireEvent.mouseUp(overlay, { clientX: 80, clientY: 100 });

  expect(screen.getByLabelText("调整右下角")).toBeTruthy();
  return overlay;
}

describe("ScreenshotOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    screenshotApi.listWindowTargets.mockReset();
    screenshotApi.listWindowTargets.mockResolvedValue([]);
    screenshotApi.getCursorPoint.mockReset();
    screenshotApi.getCursorPoint.mockRejectedValue(new Error("cursor polling disabled in this test"));
    screenshotApi.showTip.mockReset();
    screenshotApi.showTip.mockResolvedValue(undefined);
    writeClipboardText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeClipboardText },
    });
    window.petdex = {
      config: {
        get: vi.fn(),
        set: vi.fn(),
        setApiKey: vi.fn(),
        hasApiKey: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        listContributions: vi.fn(),
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn(),
        chat: vi.fn(),
        testConnection: vi.fn(),
      },
      windowControls: {
        close: vi.fn(),
      },
      screenshot: screenshotApi,
    };
  });

  it("defaults to a fullscreen selection before the user drags", async () => {
    const { container } = render(<ScreenshotOverlay />);

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    const selection = container.querySelector(".screenshot-selection") as HTMLElement | null;

    expect(selection).toBeTruthy();
    expect(selection?.style.left).toBe("0px");
    expect(selection?.style.top).toBe("0px");
    expect(selection?.style.width).toBe(`${window.innerWidth}px`);
    expect(selection?.style.height).toBe(`${window.innerHeight}px`);
  });

  it("snaps the selection to a hovered application window and confirms it directly", async () => {
    screenshotApi.listWindowTargets.mockResolvedValueOnce([
      { id: "window-1", title: "编辑器", x: 120, y: 90, width: 420, height: 280 },
    ]);
    const { container } = render(<ScreenshotOverlay />);
    const overlay = container.querySelector(".screenshot-overlay") as HTMLElement;

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(overlay, { clientX: 160, clientY: 120 });

    const selection = container.querySelector(".screenshot-selection") as HTMLElement;
    expect(selection.style.left).toBe("120px");
    expect(selection.style.top).toBe("90px");
    expect(selection.style.width).toBe("420px");
    expect(selection.style.height).toBe("280px");

    fireEvent.mouseDown(overlay, { clientX: 160, clientY: 120 });
    fireEvent.mouseUp(overlay, { clientX: 160, clientY: 120 });

    expect(screenshotApi.captureSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确定截图" }));

    await waitFor(() => expect(screenshotApi.captureSelection).toHaveBeenCalledWith({ x: 120, y: 90, width: 420, height: 280 }, { restoreOverlay: false }));
    await waitFor(() => expect(screenshotApi.copyCapture).toHaveBeenCalledWith("capture-1"));
    await waitFor(() => expect(screenshotApi.showTip).toHaveBeenCalledWith("截图已复制到剪贴板"));
    await waitFor(() => expect(screenshotApi.closeOverlay).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("截图结果")).toBeNull();
  });

  it("uses the first display target as the initial fullscreen selection when displays are reported", async () => {
    screenshotApi.listWindowTargets.mockResolvedValueOnce([
      { id: "display-1", title: "显示器 1", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器 2", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    const { container } = render(<ScreenshotOverlay />);

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const selection = container.querySelector(".screenshot-selection") as HTMLElement;
      expect(selection.style.width).toBe("1920px");
      expect(selection.style.height).toBe("1080px");
    });
  });

  it("snaps in virtual desktop coordinates without resetting to the cursor display", async () => {
    screenshotApi.listWindowTargets.mockResolvedValueOnce([
      { id: "display-1", title: "显示器 1", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器 2", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    screenshotApi.getCursorPoint.mockResolvedValue({
      x: 2000,
      y: 120,
      displayChanged: false,
      displayId: 2,
      displaySize: { width: 3200, height: 1080 },
    });
    const { container } = render(<ScreenshotOverlay />);

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screenshotApi.getCursorPoint).toHaveBeenCalled());
    await waitFor(() => {
      const selection = container.querySelector(".screenshot-selection") as HTMLElement;
      expect(selection.style.left).toBe("1920px");
      expect(selection.style.top).toBe("0px");
      expect(selection.style.width).toBe("1280px");
      expect(selection.style.height).toBe("1024px");
    });
  });

  it("keeps application window snapping after the cursor moves between displays", async () => {
    const firstScreenWindow = { id: "window-1", title: "编辑器", x: 120, y: 90, width: 420, height: 280 };
    const secondScreenWindow = { id: "window-2", title: "浏览器", x: 1980, y: 50, width: 300, height: 220 };
    screenshotApi.listWindowTargets.mockResolvedValueOnce([
      firstScreenWindow,
      secondScreenWindow,
      { id: "display-1", title: "显示器 1", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器 2", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    screenshotApi.getCursorPoint.mockResolvedValue({
      x: 2000,
      y: 80,
      displayChanged: false,
      displayId: 2,
      displaySize: { width: 3200, height: 1080 },
    });
    const { container } = render(<ScreenshotOverlay />);
    const overlay = container.querySelector(".screenshot-overlay") as HTMLElement;

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const selection = container.querySelector(".screenshot-selection") as HTMLElement;
      expect(selection.style.left).toBe("1980px");
      expect(selection.style.top).toBe("50px");
      expect(selection.style.width).toBe("300px");
      expect(selection.style.height).toBe("220px");
    });

    fireEvent.mouseMove(overlay, { clientX: 160, clientY: 120 });

    await waitFor(() => {
      const selection = container.querySelector(".screenshot-selection") as HTMLElement;
      expect(selection.style.left).toBe("120px");
      expect(selection.style.top).toBe("90px");
      expect(selection.style.width).toBe("420px");
      expect(selection.style.height).toBe("280px");
    });
    expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1);
  });
  it("moves a locked selection onto another display while dragging it", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 3200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1080 });
    const { container } = render(<ScreenshotOverlay />);
    const overlay = await lockSelection(container);
    const selection = container.querySelector(".screenshot-selection") as HTMLElement;

    fireEvent.mouseDown(selection, { clientX: 30, clientY: 40 });
    fireEvent.mouseMove(overlay, { clientX: 2140, clientY: 160 });

    await waitFor(() => {
      expect(selection.style.left).toBe("2120px");
      expect(selection.style.top).toBe("140px");
      expect(selection.style.width).toBe("70px");
      expect(selection.style.height).toBe("80px");
    });
  });

  it("keeps the toolbar inside the chosen display for cross-display selections", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 3200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1080 });
    screenshotApi.listWindowTargets.mockResolvedValueOnce([
      { id: "display-1", title: "显示器 1", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器 2", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    const { container } = render(<ScreenshotOverlay />);
    const overlay = container.querySelector(".screenshot-overlay") as HTMLElement;

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(overlay, { clientX: 20, clientY: 120 });
    fireEvent.mouseMove(overlay, { clientX: 3100, clientY: 960 });
    fireEvent.mouseUp(overlay, { clientX: 3100, clientY: 960 });

    const toolbar = screen.getByRole("toolbar", { name: "截图工具栏" });
    await waitFor(() => expect(toolbar.style.maxWidth).toBe("1896px"));
    expect(toolbar.style.bottom).toBe("auto");
    expect(toolbar.style.top).toBe("1002px");
    expect(Number.parseFloat(toolbar.style.left)).toBeLessThanOrEqual(1448);
  });

  it("keeps the status prompt inside the chosen display for cross-display selections", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 3200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1080 });
    screenshotApi.listWindowTargets.mockResolvedValueOnce([
      { id: "display-1", title: "显示器 1", x: 0, y: 0, width: 1920, height: 1080 },
      { id: "display-2", title: "显示器 2", x: 1920, y: 0, width: 1280, height: 1024 },
    ]);
    const { container } = render(<ScreenshotOverlay />);
    const overlay = container.querySelector(".screenshot-overlay") as HTMLElement;

    await waitFor(() => expect(screenshotApi.listWindowTargets).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(overlay, { clientX: 20, clientY: 120 });
    fireEvent.mouseMove(overlay, { clientX: 3100, clientY: 960 });
    fireEvent.mouseUp(overlay, { clientX: 3100, clientY: 960 });

    const status = screen.getByRole("status");
    await waitFor(() => expect(status.style.maxWidth).toBe("1896px"));
    expect(status.style.bottom).toBe("auto");
    expect(status.style.top).toBe("954px");
    expect(Number.parseFloat(status.style.left)).toBeLessThanOrEqual(1460);
  });
  it("closes the overlay when right-clicking during screenshot selection", async () => {
    const { container } = render(<ScreenshotOverlay />);
    const overlay = container.querySelector(".screenshot-overlay") as HTMLElement;

    fireEvent.contextMenu(overlay);

    await waitFor(() => expect(screenshotApi.closeOverlay).toHaveBeenCalledTimes(1));
  });

  it("moves the locked selection when dragging from the center edit area", async () => {
    const { container } = render(<ScreenshotOverlay />);
    const overlay = await lockSelection(container);
    const drawingSurface = screen.getByLabelText("截图绘制层");
    const selection = container.querySelector(".screenshot-selection") as HTMLElement;

    fireEvent.mouseDown(drawingSurface, { clientX: 45, clientY: 60 });
    fireEvent.mouseMove(overlay, { clientX: 95, clientY: 110 });
    fireEvent.mouseUp(overlay, { clientX: 95, clientY: 110 });

    await waitFor(() => {
      expect(selection.style.left).toBe("60px");
      expect(selection.style.top).toBe("70px");
      expect(selection.style.width).toBe("70px");
      expect(selection.style.height).toBe("80px");
    });
    expect(screen.queryByLabelText("截图标注层")).toBeNull();
  });
  it("keeps the selected area adjustable until the user confirms capture", async () => {
    const { container } = render(<ScreenshotOverlay />);
    const overlay = await lockSelection(container);

    expect(screenshotApi.captureSelection).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByLabelText("调整右下角"), { clientX: 80, clientY: 100 });
    fireEvent.mouseMove(overlay, { clientX: 120, clientY: 140 });
    fireEvent.mouseUp(overlay, { clientX: 120, clientY: 140 });

    fireEvent.click(screen.getByRole("button", { name: "确定截图" }));

    await waitFor(() => expect(screenshotApi.captureSelection).toHaveBeenCalledWith({ x: 10, y: 20, width: 110, height: 120 }, { restoreOverlay: false }));
  });

  it("enables editing while the selection is locked and confirms without entering preview", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);

    expect((screen.getByRole("button", { name: "矩形标注" }) as HTMLButtonElement).disabled).toBe(false);
    const drawingSurface = screen.getByLabelText("截图绘制层");
    fireEvent.click(screen.getByRole("button", { name: "矩形标注" }));
    fireEvent.mouseDown(drawingSurface, { clientX: 12, clientY: 14 });
    fireEvent.mouseMove(drawingSurface, { clientX: 42, clientY: 54 });
    fireEvent.mouseUp(drawingSurface, { clientX: 42, clientY: 54 });

    expect(await screen.findByLabelText("截图标注层")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确定截图" }));

    await waitFor(() => expect(screenshotApi.captureSelection).toHaveBeenCalledWith({ x: 10, y: 20, width: 70, height: 80 }, { restoreOverlay: false }));
    await waitFor(() => expect(screenshotApi.updateCapture).toHaveBeenCalledWith("capture-1", expect.stringMatching(/^data:image\//)));
    await waitFor(() => expect(screenshotApi.copyCapture).toHaveBeenCalledWith("capture-1"));
    await waitFor(() => expect(screenshotApi.showTip).toHaveBeenCalledWith("截图已复制到剪贴板"));
    await waitFor(() => expect(screenshotApi.closeOverlay).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("截图结果")).toBeNull();
  });

  it("exposes copy, save, OCR, pin, and close actions from the locked selection", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);

    fireEvent.click(screen.getByRole("button", { name: "复制截图" }));
    await waitFor(() => expect(screenshotApi.copyCapture).toHaveBeenCalledWith("capture-1"));

    fireEvent.click(screen.getByRole("button", { name: "保存截图" }));
    expect(await screen.findByText("已保存：C:\\tmp\\capture.png")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OCR 识别" }));
    await waitFor(() => expect(screenshotApi.ocrCapture).toHaveBeenCalledWith("capture-1"));
    expect(await screen.findByText("识别文本")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "钉住截图" }));
    await waitFor(() => expect(screenshotApi.pinCapture).toHaveBeenCalledWith("capture-1"));

    fireEvent.click(screen.getByRole("button", { name: "关闭截图" }));
    await waitFor(() => expect(screenshotApi.closeOverlay).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("截图结果")).toBeNull();
  });

  it("overlays OCR text on the selected area and toggles back", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);

    fireEvent.click(screen.getByRole("button", { name: "OCR 识别" }));

    const ocrLayer = await screen.findByLabelText("OCR 覆盖结果");
    expect(ocrLayer.textContent).toContain("识别文本");

    fireEvent.click(screen.getByRole("button", { name: "复制OCR结果" }));
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith("识别文本"));

    fireEvent.click(screen.getByRole("button", { name: "显示原图" }));
    expect(screen.queryByLabelText("OCR 覆盖结果")).toBeNull();
    expect(screen.queryByText("识别文本")).toBeNull();
    expect(screen.getByRole("button", { name: "显示OCR" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "显示OCR" }));
    expect((await screen.findByLabelText("OCR 覆盖结果")).textContent).toContain("识别文本");
  });

  it("renders the screenshot toolbar as icon buttons with color and text size controls", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);

    const toolbar = await screen.findByLabelText("截图工具栏");
    expect(toolbar.querySelector(".screenshot-toolbar-label")).toBeNull();
    expect(screen.getByRole("button", { name: "矩形标注" }).querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确定截图" }).querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "关闭截图" }).querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "选择绿色" })).toBeTruthy();
    expect(screen.getByLabelText("文字字号")).toBeTruthy();
  });

  it("applies the selected annotation color to shape tools", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);
    const drawingSurface = await screen.findByLabelText("截图绘制层");

    fireEvent.click(screen.getByRole("button", { name: "选择绿色" }));
    fireEvent.click(screen.getByRole("button", { name: "矩形标注" }));
    fireEvent.mouseDown(drawingSurface, { clientX: 12, clientY: 14 });
    fireEvent.mouseMove(drawingSurface, { clientX: 42, clientY: 54 });
    fireEvent.mouseUp(drawingSurface, { clientX: 42, clientY: 54 });

    const annotationLayer = await screen.findByLabelText("截图标注层");
    expect(annotationLayer.querySelector("rect")?.getAttribute("stroke")).toBe("#22c55e");
  });

  it("draws annotations through a non-draggable drawing surface", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);
    const drawingSurface = await screen.findByLabelText("截图绘制层");

    expect(fireEvent.dragStart(drawingSurface)).toBe(false);

    const tools = ["矩形标注", "箭头标注", "画笔标注", "马赛克标注"];
    for (const tool of tools) {
      fireEvent.click(screen.getByRole("button", { name: tool }));
      fireEvent.mouseDown(drawingSurface, { clientX: 12, clientY: 14 });
      fireEvent.mouseMove(drawingSurface, { clientX: 42, clientY: 54 });
      fireEvent.mouseUp(drawingSurface, { clientX: 42, clientY: 54 });
    }

    expect(await screen.findByLabelText("截图标注层")).toBeTruthy();
  });

  it("renders arrow annotations with an arrow head", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);
    const drawingSurface = await screen.findByLabelText("截图绘制层");

    fireEvent.click(screen.getByRole("button", { name: "箭头标注" }));
    fireEvent.mouseDown(drawingSurface, { clientX: 12, clientY: 14 });
    fireEvent.mouseMove(drawingSurface, { clientX: 42, clientY: 54 });
    fireEvent.mouseUp(drawingSurface, { clientX: 42, clientY: 54 });

    const annotationLayer = await screen.findByLabelText("截图标注层");
    expect(annotationLayer.querySelector("line")).toBeTruthy();
    expect(annotationLayer.querySelector("polygon")).toBeTruthy();
  });

  it("opens an editable text input before placing text annotations with the selected size", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);
    const drawingSurface = await screen.findByLabelText("截图绘制层");

    fireEvent.click(screen.getByRole("button", { name: "文字标注" }));
    fireEvent.change(screen.getByLabelText("文字字号"), { target: { value: "32" } });
    fireEvent.mouseDown(drawingSurface, { clientX: 24, clientY: 28 });

    const input = await screen.findByRole("textbox", { name: "输入标注文字" });
    expect(screen.queryByText("文字", { selector: "text" })).toBeNull();
    expect(input.getAttribute("style")).toContain("font-size: 32px");

    fireEvent.change(input, { target: { value: "自定义备注" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const textAnnotation = await screen.findByText("自定义备注");
    expect(textAnnotation).toBeTruthy();
    expect(textAnnotation.getAttribute("font-size")).toBe("32");
    expect(screen.queryByRole("textbox", { name: "输入标注文字" })).toBeNull();
  });

  it("syncs annotated captures before saving", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);
    const drawingSurface = await screen.findByLabelText("截图绘制层");

    fireEvent.click(screen.getByRole("button", { name: "矩形标注" }));
    fireEvent.mouseDown(drawingSurface, { clientX: 12, clientY: 14 });
    fireEvent.mouseMove(drawingSurface, { clientX: 42, clientY: 54 });
    fireEvent.mouseUp(drawingSurface, { clientX: 42, clientY: 54 });

    expect(await screen.findByLabelText("截图标注层")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存截图" }));

    await waitFor(() => expect(screenshotApi.updateCapture).toHaveBeenCalledWith(
      "capture-1",
      expect.stringMatching(/^data:image\//),
    ));
    expect(screenshotApi.saveCapture).toHaveBeenCalledWith("capture-1");
  });

  it("supports redo and clearing annotations", async () => {
    const { container } = render(<ScreenshotOverlay />);
    await lockSelection(container);
    const drawingSurface = await screen.findByLabelText("截图绘制层");

    fireEvent.click(screen.getByRole("button", { name: "矩形标注" }));
    fireEvent.mouseDown(drawingSurface, { clientX: 12, clientY: 14 });
    fireEvent.mouseMove(drawingSurface, { clientX: 42, clientY: 54 });
    fireEvent.mouseUp(drawingSurface, { clientX: 42, clientY: 54 });
    expect((await screen.findByLabelText("截图标注层")).querySelectorAll("rect")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "撤销标注" }));
    expect(screen.queryByLabelText("截图标注层")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重做标注" }));
    expect((await screen.findByLabelText("截图标注层")).querySelectorAll("rect")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "清空标注" }));
    expect(screen.queryByLabelText("截图标注层")).toBeNull();
  });
});



