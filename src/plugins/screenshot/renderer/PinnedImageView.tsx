import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Copy, Download, Maximize2, Minimize2, X } from "lucide-react";
import type { ScreenshotCaptureResult } from "../workflow";
import "./screenshot.css";

export function PinnedImageView() {
  const [captureId, setCaptureId] = useState("");
  const [capture, setCapture] = useState<ScreenshotCaptureResult | undefined>();
  const [message, setMessage] = useState("正在加载贴图...");
  const [copyStatus, setCopyStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [imageOpacity, setImageOpacity] = useState(1);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Full-resolution blob URL, loaded on demand when the pinned image is
  // zoomed/previewed so the preview thumbnail is not scaled up.
  const [fullResUrl, setFullResUrl] = useState<string | undefined>();
  const fullResLoadedRef = useRef(false);
  const dragPoint = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (fullResUrl) {
        URL.revokeObjectURL(fullResUrl);
      }
    };
  }, [fullResUrl]);

  async function loadFullResolution() {
    if (fullResLoadedRef.current || !captureId) {
      return;
    }

    const api = window.petdex?.screenshot;
    if (!api?.getCaptureImage) {
      return;
    }

    try {
      const bytes = await api.getCaptureImage(captureId);
      if (bytes.byteLength === 0) {
        return;
      }

      setFullResUrl(URL.createObjectURL(new Blob([bytes], { type: "image/png" })));
      fullResLoadedRef.current = true;
    } catch {
      // Keep the preview thumbnail when the full-resolution fetch fails.
    }
  }

  useEffect(() => {
    const nextCaptureId = new URLSearchParams(window.location.search).get("captureId") ?? "";
    setCaptureId(nextCaptureId);
    if (!nextCaptureId) {
      setMessage("贴图不存在");
      return;
    }

    void window.petdex?.screenshot?.getCapture(nextCaptureId)
      .then((result) => {
        if (!result) {
          setMessage("贴图已过期，请重新截图。");
          return;
        }

        setCapture(result);
        setMessage("");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载贴图失败");
      });
  }, []);

  useEffect(() => {
    if (!previewing) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void setPreviewMode(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewing]);

  function rootClassName() {
    return [
      "pinned-image-root",
      zoomed ? "pinned-image-root--zoomed" : "",
      previewing ? "pinned-image-root--previewing" : "",
    ].filter(Boolean).join(" ");
  }

  function startDrag(event: MouseEvent<HTMLElement>) {
    if (previewing || event.button !== 0) {
      return;
    }

    dragPoint.current = { x: event.screenX, y: event.screenY };
  }

  function movePinnedWindow(event: MouseEvent<HTMLElement>) {
    if (previewing || !dragPoint.current) {
      return;
    }

    const deltaX = event.screenX - dragPoint.current.x;
    const deltaY = event.screenY - dragPoint.current.y;
    if (deltaX !== 0 || deltaY !== 0) {
      void window.petdex?.pet?.moveBy(deltaX, deltaY);
      dragPoint.current = { x: event.screenX, y: event.screenY };
    }
  }

  function stopDrag() {
    dragPoint.current = undefined;
  }

  async function toggleZoom() {
    if (previewing) {
      await setPreviewMode(false);
      return;
    }

    void loadFullResolution();
    const result = await window.petdex?.windowControls.togglePinnedImageZoom?.();
    setZoomed(result?.zoomed ?? !zoomed);
  }

  async function setPreviewMode(nextPreviewing: boolean) {
    stopDrag();
    if (nextPreviewing) {
      void loadFullResolution();
    }
    const result = await window.petdex?.windowControls.setPinnedImagePreview?.(nextPreviewing);
    setPreviewing(result?.previewing ?? nextPreviewing);
  }

  function stopControlEvent(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function openContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuOpen(true);
  }

  async function savePinnedImage(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!captureId) {
      return;
    }

    const result = await window.petdex?.screenshot?.saveCapture(captureId);
    if (result?.filePath) {
      setSaveStatus(`已保存：${result.filePath}`);
      window.setTimeout(() => setSaveStatus(""), 1800);
    }
    setContextMenuOpen(false);
  }

  async function copyPinnedImage(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!captureId) {
      return;
    }

    await window.petdex?.screenshot?.copyCapture(captureId);
    setContextMenuOpen(false);
    setCopyStatus("已复制");
    window.setTimeout(() => setCopyStatus(""), 1200);
  }

  return (
    <main className={rootClassName()}>
      {capture ? (
        <section
          className="pinned-image-stage"
          aria-label="桌面贴图预览"
          onDoubleClick={() => void toggleZoom()}
          onMouseDown={startDrag}
          onMouseMove={movePinnedWindow}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onContextMenu={openContextMenu}
        >
          <img src={fullResUrl ?? capture.dataUrl} alt="桌面贴图" draggable={false} style={{ opacity: imageOpacity }} />
          {previewing && (
            <div className="pinned-image-preview-topbar" onMouseDown={stopControlEvent} onDoubleClick={stopControlEvent}>
              <button
                className="pinned-image-preview-exit-button"
                type="button"
                aria-label="退出全屏预览"
                title="退出预览"
                onClick={() => void setPreviewMode(false)}
              >
                <Minimize2 aria-hidden="true" size={16} strokeWidth={2.2} />
                <span>退出预览</span>
              </button>
            </div>
          )}
          <div className="pinned-image-toolbar" onMouseDown={stopControlEvent} onDoubleClick={stopControlEvent}>
            {copyStatus && <span className="pinned-image-copy-status">{copyStatus}</span>}
            {saveStatus && <span className="pinned-image-copy-status">{saveStatus}</span>}
            <label className="pinned-image-opacity-control">
              <span>透明度</span>
              <input
                aria-label="贴图透明度"
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={imageOpacity}
                onChange={(event) => setImageOpacity(Number(event.currentTarget.value))}
              />
            </label>
            {!previewing && (
              <button
                className="pinned-image-tool-button pinned-image-preview-button"
                type="button"
                aria-label="全屏预览贴图"
                title="全屏预览"
                onClick={() => void setPreviewMode(true)}
              >
                <Maximize2 aria-hidden="true" size={15} strokeWidth={2.2} />
              </button>
            )}
            <button
              className="pinned-image-tool-button pinned-image-save-button"
              type="button"
              aria-label="保存贴图"
              title="保存"
              onClick={(event) => void savePinnedImage(event)}
            >
              <Download aria-hidden="true" size={15} strokeWidth={2.2} />
            </button>
            <button
              className="pinned-image-tool-button pinned-image-copy-button"
              type="button"
              aria-label="复制贴图"
              title="复制"
              onClick={copyPinnedImage}
            >
              <Copy aria-hidden="true" size={15} strokeWidth={2.2} />
            </button>
            <button
              className="pinned-image-tool-button pinned-image-close-button"
              type="button"
              aria-label="关闭贴图"
              title="关闭"
              onClick={() => void window.petdex?.windowControls.close()}
            >
              <X aria-hidden="true" size={16} strokeWidth={2.2} />
            </button>
          </div>
          {contextMenuOpen && (
            <div className="pinned-image-context-menu" role="menu" onMouseDown={stopControlEvent} onDoubleClick={stopControlEvent}>
              <button type="button" role="menuitem" onClick={(event) => void savePinnedImage(event)}>保存</button>
              <button type="button" role="menuitem" onClick={copyPinnedImage}>复制</button>
              <label>
                透明度
                <input
                  aria-label="右键菜单贴图透明度"
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={imageOpacity}
                  onChange={(event) => setImageOpacity(Number(event.currentTarget.value))}
                />
              </label>
              <button type="button" role="menuitem" onClick={() => void window.petdex?.windowControls.close()}>关闭</button>
            </div>
          )}
        </section>
      ) : (
        <p>{message}</p>
      )}
    </main>
  );
}