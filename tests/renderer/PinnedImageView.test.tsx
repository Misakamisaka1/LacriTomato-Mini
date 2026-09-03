import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PinnedImageView } from "../../src/plugins/screenshot/renderer/PinnedImageView";

const screenshotApi = {
  captureSelection: vi.fn(),
  updateCapture: vi.fn(),
  copyCapture: vi.fn().mockResolvedValue(undefined),
  saveCapture: vi.fn().mockResolvedValue({ filePath: "C:\\tmp\\capture.png" }),
  ocrCapture: vi.fn(),
  pinCapture: vi.fn(),
  getCapture: vi.fn().mockResolvedValue({
    id: "capture-1",
    dataUrl: "data:image/png;base64,ZmFrZQ==",
    width: 320,
    height: 180,
  }),
  getCaptureImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  listWindowTargets: vi.fn().mockResolvedValue([]),
  getCursorPoint: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
  reportSession: vi.fn().mockResolvedValue(undefined),
  onSessionUpdate: vi.fn((_callback: (state: unknown) => void) => () => undefined),
  onCursorUpdate: vi.fn(),
  showTip: vi.fn().mockResolvedValue(undefined),
  closeOverlay: vi.fn(),
};

const windowControls = {
  close: vi.fn().mockResolvedValue(undefined),
  togglePinnedImageZoom: vi.fn().mockResolvedValue({ zoomed: true }),
  setPinnedImagePreview: vi.fn().mockResolvedValue({ previewing: true }),
};

describe("PinnedImageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windowControls.setPinnedImagePreview.mockResolvedValue({ previewing: true });
    window.history.pushState({}, "", "/?view=pinned-image&captureId=capture-1");
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
      windowControls,
      screenshot: screenshotApi,
    };
  });

  it("loads a pinned image and copies it from a floating no-drag button", async () => {
    render(<PinnedImageView />);

    expect(await screen.findByAltText("桌面贴图")).toBeTruthy();
    const copyButton = screen.getByRole("button", { name: "复制贴图" });

    expect(copyButton.className).toContain("pinned-image-tool-button");
    expect(copyButton.className).toContain("pinned-image-copy-button");
    fireEvent.click(copyButton);

    await waitFor(() => expect(screenshotApi.copyCapture).toHaveBeenCalledWith("capture-1"));
    expect(windowControls.close).not.toHaveBeenCalled();
  });

  it("toggles zoom when the pinned image is double clicked", async () => {
    render(<PinnedImageView />);

    const stage = await screen.findByLabelText("桌面贴图预览");
    fireEvent.doubleClick(stage);

    await waitFor(() => expect(windowControls.togglePinnedImageZoom).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("main").className).toContain("pinned-image-root--zoomed");
  });

  it("loads the full-resolution image when the pinned image is zoomed", async () => {
    render(<PinnedImageView />);

    await screen.findByAltText("桌面贴图");
    fireEvent.doubleClick(screen.getByLabelText("桌面贴图预览"));

    await waitFor(() => expect(screenshotApi.getCaptureImage).toHaveBeenCalledWith("capture-1"));
  });

  it("opens and exits a fullscreen preview from the pinned image toolbar", async () => {
    render(<PinnedImageView />);

    await screen.findByAltText("桌面贴图");
    const previewButton = screen.getByRole("button", { name: "全屏预览贴图" });

    expect(previewButton.className).toContain("pinned-image-tool-button");
    fireEvent.click(previewButton);

    await waitFor(() => expect(windowControls.setPinnedImagePreview).toHaveBeenCalledWith(true));
    expect(screen.getByRole("main").className).toContain("pinned-image-root--previewing");

    const exitButton = screen.getByRole("button", { name: "退出全屏预览" });
    windowControls.setPinnedImagePreview.mockResolvedValueOnce({ previewing: false });
    fireEvent.click(exitButton);

    await waitFor(() => expect(windowControls.setPinnedImagePreview).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole("main").className).not.toContain("pinned-image-root--previewing");
  });
  it("saves a pinned image and adjusts its opacity", async () => {
    render(<PinnedImageView />);

    const image = await screen.findByAltText("桌面贴图");
    fireEvent.click(screen.getByRole("button", { name: "保存贴图" }));
    await waitFor(() => expect(screenshotApi.saveCapture).toHaveBeenCalledWith("capture-1"));
    expect(await screen.findByText("已保存：C:\\tmp\\capture.png")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("贴图透明度"), { target: { value: "0.45" } });
    expect(image.getAttribute("style")).toContain("opacity: 0.45");
  });
});
