import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type CSSProperties } from "react";
import { ArrowUpRight, Check, Copy, Download, Image as ImageIcon, PenLine, Pin, Redo2, RefreshCcw, ScanText, Square, SquareDashed, Trash2, Type, Undo2, X } from "lucide-react";
import { addAnnotation, undoAnnotation, type Annotation, type Point } from "../types";
import {
  createFullscreenSelection,
  findScreenshotTargetAtPoint,
  isUsableSelection,
  normalizeSelection,
  type ImageSize,
  type ScreenshotCaptureOptions,
  type ScreenshotCaptureResult,
  type ScreenshotSelection,
  type ScreenshotWindowTarget,
} from "../workflow";
import "./screenshot.css";

const disconnectedMessage = "截图服务未连接，请重新启动应用。";

const manualSelectionThreshold = 3;
const defaultAnnotationColor = "#ff4d4f";
const defaultTextFontSize = 22;
const annotationColors = [
  { label: "红色", value: "#ff4d4f" },
  { label: "黄色", value: "#facc15" },
  { label: "绿色", value: "#22c55e" },
  { label: "蓝色", value: "#2563eb" },
  { label: "黑色", value: "#111827" },
  { label: "灰色", value: "#9ca3af" },
  { label: "白色", value: "#ffffff" },
] as const;
const textFontSizes = [16, 18, 22, 26, 32] as const;
type AnnotationTool = "rect" | "arrow" | "pen" | "text" | "mosaic";
interface TextDraft {
  x: number;
  y: number;
  value: string;
  color: string;
  fontSize: number;
}

type SelectionHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type SelectionDrag =
  | { mode: "move"; origin: Point; selection: ScreenshotSelection }
  | { mode: "resize"; handle: SelectionHandle; selection: ScreenshotSelection };

const selectionMinSize = 4;
const toolbarDisplayMargin = 12;
const toolbarBottomMargin = 18;
const toolbarEstimatedWidth = 920;
const toolbarEstimatedHeight = 60;
const statusEstimatedWidth = 920;
const statusEstimatedHeight = 38;
const statusToolbarGap = 10;
const selectionHandles: Array<{ handle: SelectionHandle; label: string }> = [
  { handle: "nw", label: "调整左上角" },
  { handle: "n", label: "调整上边" },
  { handle: "ne", label: "调整右上角" },
  { handle: "e", label: "调整右边" },
  { handle: "se", label: "调整右下角" },
  { handle: "s", label: "调整下边" },
  { handle: "sw", label: "调整左下角" },
  { handle: "w", label: "调整左边" },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function pointsToPath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function arrowHeadPoints(from: Point, to: Point, size = 12) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return [
    to,
    {
      x: to.x - size * Math.cos(angle - Math.PI / 6),
      y: to.y - size * Math.sin(angle - Math.PI / 6),
    },
    {
      x: to.x - size * Math.cos(angle + Math.PI / 6),
      y: to.y - size * Math.sin(angle + Math.PI / 6),
    },
  ];
}

function pointsToPolygon(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function readSurfacePoint(event: MouseEvent<HTMLElement>, size: { width: number; height: number }): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = rect.width || size.width;
  const height = rect.height || size.height;
  const left = rect.width ? rect.left : 0;
  const top = rect.height ? rect.top : 0;

  return {
    x: Math.max(0, Math.min(size.width, ((event.clientX - left) / width) * size.width)),
    y: Math.max(0, Math.min(size.height, ((event.clientY - top) / height) * size.height)),
  };
}

function readPreviewPoint(event: MouseEvent<HTMLElement>, capture: ScreenshotCaptureResult): Point {
  return readSurfacePoint(event, capture);
}

function toScreenshotSelection(selection: ScreenshotSelection): ScreenshotSelection {
  return {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  };
}

function selectionsEqual(a: ScreenshotSelection | undefined, b: ScreenshotSelection) {
  return Boolean(a)
    && a?.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampSelectionToBounds(selection: ScreenshotSelection, bounds: ScreenshotSelection): ScreenshotSelection {
  const width = Math.min(Math.max(selectionMinSize, selection.width), bounds.width);
  const height = Math.min(Math.max(selectionMinSize, selection.height), bounds.height);

  return {
    x: clamp(selection.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(selection.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  };
}

function resizeSelectionFromHandle(
  selection: ScreenshotSelection,
  handle: SelectionHandle,
  point: Point,
  bounds: ScreenshotSelection,
): ScreenshotSelection {
  let left = selection.x;
  let top = selection.y;
  let right = selection.x + selection.width;
  let bottom = selection.y + selection.height;

  if (handle.includes("w")) {
    left = clamp(point.x, bounds.x, right - selectionMinSize);
  }

  if (handle.includes("e")) {
    right = clamp(point.x, left + selectionMinSize, bounds.x + bounds.width);
  }

  if (handle.includes("n")) {
    top = clamp(point.y, bounds.y, bottom - selectionMinSize);
  }

  if (handle.includes("s")) {
    bottom = clamp(point.y, top + selectionMinSize, bounds.y + bounds.height);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function moveSelectionWithinBounds(
  selection: ScreenshotSelection,
  origin: Point,
  point: Point,
  bounds: ScreenshotSelection,
): ScreenshotSelection {
  return clampSelectionToBounds({
    ...selection,
    x: selection.x + point.x - origin.x,
    y: selection.y + point.y - origin.y,
  }, bounds);
}

function getSelectionIntersectionArea(a: ScreenshotSelection, b: ScreenshotSelection) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function containsSelectionPoint(target: ScreenshotSelection, point: Point) {
  return point.x >= target.x
    && point.x <= target.x + target.width
    && point.y >= target.y
    && point.y <= target.y + target.height;
}

function chooseToolbarDisplay(selection: ScreenshotSelection, targets: ScreenshotWindowTarget[], fallback: ScreenshotSelection) {
  const displayTargets = targets.filter((target) => target.id.startsWith("display-"));
  if (displayTargets.length === 0) {
    return fallback;
  }

  const center = {
    x: selection.x + selection.width / 2,
    y: selection.y + selection.height / 2,
  };
  const centerDisplay = displayTargets.find((target) => containsSelectionPoint(target, center));
  if (centerDisplay) {
    return centerDisplay;
  }

  return displayTargets
    .map((target) => ({ target, area: getSelectionIntersectionArea(selection, target) }))
    .sort((a, b) => b.area - a.area)[0]?.target ?? displayTargets[0];
}

function createToolbarStyle(
  selection: ScreenshotSelection,
  targets: ScreenshotWindowTarget[],
  fallbackBounds: ScreenshotSelection,
): CSSProperties {
  const display = chooseToolbarDisplay(selection, targets, fallbackBounds);
  const availableWidth = Math.max(1, display.width - toolbarDisplayMargin * 2);
  const halfWidth = Math.min(toolbarEstimatedWidth / 2, availableWidth / 2);
  const minLeft = display.x + toolbarDisplayMargin + halfWidth;
  const maxLeft = display.x + display.width - toolbarDisplayMargin - halfWidth;
  const preferredLeft = selection.x + selection.width / 2;
  const left = maxLeft >= minLeft
    ? clamp(preferredLeft, minLeft, maxLeft)
    : display.x + display.width / 2;
  const top = display.y + Math.max(toolbarDisplayMargin, display.height - toolbarBottomMargin - toolbarEstimatedHeight);

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    bottom: "auto",
    maxWidth: `${Math.round(availableWidth)}px`,
  };
}

function createStatusStyle(
  selection: ScreenshotSelection,
  targets: ScreenshotWindowTarget[],
  fallbackBounds: ScreenshotSelection,
): CSSProperties {
  const display = chooseToolbarDisplay(selection, targets, fallbackBounds);
  const availableWidth = Math.max(1, display.width - toolbarDisplayMargin * 2);
  const halfWidth = Math.min(statusEstimatedWidth / 2, availableWidth / 2);
  const minLeft = display.x + toolbarDisplayMargin + halfWidth;
  const maxLeft = display.x + display.width - toolbarDisplayMargin - halfWidth;
  const preferredLeft = selection.x + selection.width / 2;
  const left = maxLeft >= minLeft
    ? clamp(preferredLeft, minLeft, maxLeft)
    : display.x + display.width / 2;
  const top = display.y + Math.max(
    toolbarDisplayMargin,
    display.height - toolbarBottomMargin - toolbarEstimatedHeight - statusToolbarGap - statusEstimatedHeight,
  );

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    bottom: "auto",
    maxWidth: `${Math.round(availableWidth)}px`,
  };
}
function stopPreviewDrag(event: DragEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function claimAnnotationEvent(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function annotationFromSelection(tool: AnnotationTool, start: Point, end: Point, color: string): Annotation {
  const selection = normalizeSelection(start.x, start.y, end.x, end.y);

  if (tool === "arrow") {
    return { type: "arrow", from: start, to: end, color };
  }

  if (tool === "mosaic") {
    return { type: "mosaic", rect: { x: selection.x, y: selection.y, w: selection.width, h: selection.height }, size: 10 };
  }

  return { type: "rect", x: selection.x, y: selection.y, w: selection.width, h: selection.height, color };
}

function renderAnnotation(annotation: Annotation, index: number) {
  if (annotation.type === "rect") {
    return <rect key={index} x={annotation.x} y={annotation.y} width={annotation.w} height={annotation.h} fill="transparent" stroke={annotation.color} strokeWidth="2" />;
  }

  if (annotation.type === "arrow") {
    return (
      <g key={index}>
        <line x1={annotation.from.x} y1={annotation.from.y} x2={annotation.to.x} y2={annotation.to.y} stroke={annotation.color} strokeWidth="3" strokeLinecap="round" />
        <polygon points={pointsToPolygon(arrowHeadPoints(annotation.from, annotation.to))} fill={annotation.color} />
      </g>
    );
  }

  if (annotation.type === "pen") {
    return <path key={index} d={pointsToPath(annotation.points)} fill="none" stroke={annotation.color} strokeWidth={annotation.size} strokeLinecap="round" strokeLinejoin="round" />;
  }

  if (annotation.type === "text") {
    return <text key={index} x={annotation.x} y={annotation.y} fill={annotation.color} fontSize={annotation.fontSize ?? defaultTextFontSize} fontWeight="700">{annotation.text}</text>;
  }

  return <rect key={index} x={annotation.rect.x} y={annotation.rect.y} width={annotation.rect.w} height={annotation.rect.h} fill="rgba(255,255,255,0.38)" stroke="#ffffff" strokeWidth="1" />;
}

function drawArrowHead(context: CanvasRenderingContext2D, from: Point, to: Point) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 12;
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  context.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: Annotation) {
  context.save();

  if (annotation.type === "rect") {
    context.strokeStyle = annotation.color;
    context.lineWidth = 2;
    context.strokeRect(annotation.x, annotation.y, annotation.w, annotation.h);
  }

  if (annotation.type === "arrow") {
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(annotation.from.x, annotation.from.y);
    context.lineTo(annotation.to.x, annotation.to.y);
    context.stroke();
    drawArrowHead(context, annotation.from, annotation.to);
  }

  if (annotation.type === "pen") {
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.size;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    annotation.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
  }

  if (annotation.type === "text") {
    context.fillStyle = annotation.color;
    context.font = `700 ${annotation.fontSize ?? defaultTextFontSize}px Microsoft YaHei, Segoe UI, sans-serif`;
    context.fillText(annotation.text, annotation.x, annotation.y);
  }

  if (annotation.type === "mosaic") {
    context.fillStyle = "rgba(255,255,255,0.48)";
    context.fillRect(annotation.rect.x, annotation.rect.y, annotation.rect.w, annotation.rect.h);
  }

  context.restore();
}

async function createFlattenedDataUrl(capture: ScreenshotCaptureResult, annotations: Annotation[], annotationSize = { width: capture.width, height: capture.height }) {
  if (annotations.length === 0) {
    return capture.dataUrl;
  }

  if (navigator.userAgent.toLowerCase().includes("jsdom")) {
    return capture.dataUrl;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = capture.width;
    canvas.height = capture.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return capture.dataUrl;
    }

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("截图预览加载失败"));
      image.src = capture.dataUrl;
    });
    context.drawImage(image, 0, 0, capture.width, capture.height);
    context.save();
    context.scale(capture.width / Math.max(1, annotationSize.width), capture.height / Math.max(1, annotationSize.height));
    annotations.forEach((annotation) => drawAnnotation(context, annotation));
    context.restore();
    return canvas.toDataURL("image/png");
  } catch {
    return capture.dataUrl;
  }
}

function readOcrOverlayFontSize(text: string, capture: { width: number; height: number }) {
  const imageAreaUnits = Math.max(1, (capture.width * capture.height) / 10000);
  const density = text.trim().length / imageAreaUnits;

  if (density > 18) {
    return 10;
  }

  if (density > 12) {
    return 11;
  }

  if (density > 8) {
    return 12;
  }

  if (density > 5) {
    return 13;
  }

  return 14;
}
export function ScreenshotOverlay() {
  const [start, setStart] = useState<{ x: number; y: number } | undefined>();
  const [selection, setSelection] = useState<ScreenshotSelection | undefined>();
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [selectionDrag, setSelectionDrag] = useState<SelectionDrag | undefined>();
  const [, setWindowTargets] = useState<ScreenshotWindowTarget[]>([]);
  const windowTargetsRef = useRef<ScreenshotWindowTarget[]>([]);
  const windowTargetRequestRef = useRef(0);
  const [capture, setCapture] = useState<ScreenshotCaptureResult | undefined>();
  const [status, setStatus] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [showOcrOverlay, setShowOcrOverlay] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [activeTool, setActiveTool] = useState<AnnotationTool | undefined>();
  const [annotationColor, setAnnotationColor] = useState(defaultAnnotationColor);
  const [textFontSize, setTextFontSize] = useState(defaultTextFontSize);
  const [annotationStart, setAnnotationStart] = useState<Point | undefined>();
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | undefined>();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [redoAnnotations, setRedoAnnotations] = useState<Annotation[]>([]);
  const [textDraft, setTextDraft] = useState<TextDraft | undefined>();
  const [overlaySize, setOverlaySize] = useState<ImageSize | undefined>();

  function getFullscreenSelection(size = overlaySize) {
    return createFullscreenSelection(size ?? {
      width: window.innerWidth || document.documentElement.clientWidth || 1,
      height: window.innerHeight || document.documentElement.clientHeight || 1,
    });
  }

  function getAnnotationSurfaceSize() {
    if (capture) {
      return { width: capture.width, height: capture.height };
    }

    return selectionLocked && selection ? { width: selection.width, height: selection.height } : undefined;
  }

  function replaceWindowTargets(nextTargets: ScreenshotWindowTarget[]) {
    windowTargetsRef.current = nextTargets;
    setWindowTargets(nextTargets);
  }

  useEffect(() => {
    setSelection(getFullscreenSelection());
    setStatus("单击捕获整屏，移动到窗口可自动吸附，拖拽可手动框选。");

    let cancelled = false;
    const targetRequestId = ++windowTargetRequestRef.current;
    void window.petdex?.screenshot?.listWindowTargets?.()
      .then((targets) => {
        if (!cancelled && targetRequestId === windowTargetRequestRef.current) {
          const nextTargets = targets ?? [];
          replaceWindowTargets(nextTargets);
          const displayTarget = nextTargets.find((target) => target.id.startsWith("display-"));
          if (displayTarget) {
            const fullscreenSelection = getFullscreenSelection();
            setSelection((current) => {
              const isInitialFullscreen = !current
                || (current.x === fullscreenSelection.x
                  && current.y === fullscreenSelection.y
                  && current.width === fullscreenSelection.width
                  && current.height === fullscreenSelection.height);
              return isInitialFullscreen ? displayTarget : current;
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          replaceWindowTargets([]);
        }
      });
    void Promise.resolve(window.petdex?.config?.get?.())
      .then((nextConfig) => {
        if (!cancelled && nextConfig?.screenshot.defaultAnnotationColor) {
          setAnnotationColor(nextConfig.screenshot.defaultAnnotationColor);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function captureSelection(nextSelection: ScreenshotSelection) {
    setSelection(nextSelection);

    if (!isUsableSelection(nextSelection)) {
      setStatus("截图区域太小，请重新框选。");
      return;
    }

    const api = window.petdex?.screenshot;
    if (!api) {
      setStatus(disconnectedMessage);
      return;
    }

    setBusyAction("capture");
    setStatus("正在捕获截图...");
    try {
      const result = await api.captureSelection(toScreenshotSelection(nextSelection));
      setCapture(result);
      setSelectionLocked(false);
      setSelectionDrag(undefined);
      setOcrText("");
      setShowOcrOverlay(false);
      setAnnotations([]);
      setRedoAnnotations([]);
      setStatus("截图已捕获");
    } catch (error) {
      setStatus(getErrorMessage(error, "截图失败"));
    } finally {
      setBusyAction("");
    }
  }

  function isManualSelectionDrag(endX: number, endY: number) {
    if (!start) {
      return false;
    }

    return Math.abs(endX - start.x) >= manualSelectionThreshold || Math.abs(endY - start.y) >= manualSelectionThreshold;
  }

  function lockSelection(nextSelection: ScreenshotSelection) {
    if (!isUsableSelection(nextSelection)) {
      setStatus("截图区域太小，请重新框选。");
      setSelectionLocked(false);
      return;
    }

    setSelection(nextSelection);
    setSelectionLocked(true);
    setActiveTool(undefined);
    setStatus("可拖拽移动范围，也可选择工具添加标注或 OCR；点击确定复制并关闭。");
  }

  function finishSelection(endX: number, endY: number) {
    if (!start) {
      return;
    }

    const nextSelection = isManualSelectionDrag(endX, endY)
      ? normalizeSelection(start.x, start.y, endX, endY)
      : selection ?? getFullscreenSelection();
    setStart(undefined);
    lockSelection(clampSelectionToBounds(nextSelection, getFullscreenSelection()));
  }

  function captureCurrentSelection() {
    void runSelectionAction("confirm");
  }

  async function captureSelectionForAction(api: NonNullable<NonNullable<typeof window.petdex>["screenshot"]>, includeAnnotations: boolean, options?: ScreenshotCaptureOptions) {
    if (!selection || !selectionLocked) {
      throw new Error("请先框选截图区域。");
    }

    const result = await api.captureSelection(toScreenshotSelection(selection), options);
    if (!includeAnnotations || annotations.length === 0) {
      return result;
    }

    const dataUrl = await createFlattenedDataUrl(result, annotations, { width: selection.width, height: selection.height });
    return api.updateCapture(result.id, dataUrl);
  }

  async function runSelectionAction(action: "confirm" | "copy" | "save" | "ocr" | "pin") {
    const api = window.petdex?.screenshot;
    if (!api) {
      setStatus(disconnectedMessage);
      return;
    }

    setBusyAction(action);
    try {
      const activeCapture = await captureSelectionForAction(api, action !== "ocr", action === "confirm" ? { restoreOverlay: false } : undefined);

      if (action === "confirm" || action === "copy") {
        await api.copyCapture(activeCapture.id);
        setStatus("已复制到剪贴板");
        if (action === "confirm") {
          void api.showTip?.("截图已复制到剪贴板");
          await api.closeOverlay();
        }
      }

      if (action === "save") {
        const result = await api.saveCapture(activeCapture.id);
        setStatus(`已保存：${result.filePath}`);
      }

      if (action === "ocr") {
        const result = await api.ocrCapture(activeCapture.id);
        setOcrText(result.text || "未识别到文字");
        setShowOcrOverlay(true);
        setStatus(`OCR 完成，置信度 ${Math.round(result.confidence)}%`);
      }

      if (action === "pin") {
        await api.pinCapture(activeCapture.id);
        setStatus("已钉住截图");
      }
    } catch (error) {
      setStatus(getErrorMessage(error, "操作失败"));
    } finally {
      setBusyAction("");
    }
  }

  async function syncAnnotations(api: NonNullable<typeof window.petdex>["screenshot"], currentCapture: ScreenshotCaptureResult) {
    if (!api || annotations.length === 0) {
      return currentCapture;
    }

    const dataUrl = await createFlattenedDataUrl(currentCapture, annotations);
    const updated = await api.updateCapture(currentCapture.id, dataUrl);
    setCapture(updated);
    return updated;
  }

  async function runCaptureAction(action: "confirm" | "copy" | "save" | "ocr" | "pin") {
    const api = window.petdex?.screenshot;
    if (!api || !capture) {
      setStatus(disconnectedMessage);
      return;
    }

    setBusyAction(action);
    try {
      const activeCapture = action === "ocr" ? capture : await syncAnnotations(api, capture);

      if (action === "copy" || action === "confirm") {
        await api.copyCapture(activeCapture.id);
        setStatus("已复制到剪贴板");
        if (action === "confirm") {
          void api.showTip?.("截图已复制到剪贴板");
          await api.closeOverlay();
        }
      }

      if (action === "save") {
        const result = await api.saveCapture(activeCapture.id);
        setStatus(`已保存：${result.filePath}`);
      }

      if (action === "ocr") {
        const result = await api.ocrCapture(activeCapture.id);
        setOcrText(result.text || "未识别到文字");
        setShowOcrOverlay(true);
        setStatus(`OCR 完成，置信度 ${Math.round(result.confidence)}%`);
      }

      if (action === "pin") {
        await api.pinCapture(activeCapture.id);
        setStatus("已钉住截图");
      }
    } catch (error) {
      setStatus(getErrorMessage(error, "操作失败"));
    } finally {
      setBusyAction("");
    }
  }

  function resetCapture() {
    setCapture(undefined);
    setSelection(undefined);
    setSelectionLocked(false);
    setSelectionDrag(undefined);
    setStart(undefined);
    setOcrText("");
    setShowOcrOverlay(false);
    setAnnotations([]);
    setRedoAnnotations([]);
    setDraftAnnotation(undefined);
    setTextDraft(undefined);
    setActiveTool(undefined);
    setStatus("重新框选截图区域");
  }

  async function copyOcrText() {
    if (!ocrText) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setStatus("当前环境无法访问剪贴板");
      return;
    }

    try {
      await navigator.clipboard.writeText(ocrText);
      setStatus("OCR 结果已复制");
    } catch (error) {
      setStatus(getErrorMessage(error, "复制 OCR 结果失败"));
    }
  }
  function beginAnnotation(event: MouseEvent<HTMLElement>) {
    const surfaceSize = getAnnotationSurfaceSize();
    if (!surfaceSize || event.button !== 0) {
      return;
    }

    if (!activeTool) {
      beginSelectionMove(event);
      return;
    }

    claimAnnotationEvent(event);
    const point = readSurfacePoint(event, surfaceSize);
    if (activeTool === "text") {
      setAnnotationStart(undefined);
      setDraftAnnotation(undefined);
      setTextDraft({ x: point.x, y: point.y, value: "", color: annotationColor, fontSize: textFontSize });
      setStatus("请输入文字标注");
      return;
    }

    setAnnotationStart(point);
    if (activeTool === "pen") {
      setDraftAnnotation({ type: "pen", points: [point], color: annotationColor, size: 4 });
    } else {
      setDraftAnnotation(annotationFromSelection(activeTool, point, point, annotationColor));
    }
  }

  function moveAnnotation(event: MouseEvent<HTMLElement>) {
    const surfaceSize = getAnnotationSurfaceSize();
    if (!surfaceSize || !annotationStart || !activeTool) {
      return;
    }

    claimAnnotationEvent(event);
    const point = readSurfacePoint(event, surfaceSize);
    if (activeTool === "pen") {
      setDraftAnnotation((current) => current?.type === "pen" ? { ...current, points: [...current.points, point] } : current);
      return;
    }

    setDraftAnnotation(annotationFromSelection(activeTool, annotationStart, point, annotationColor));
  }

  function finishAnnotation(event: MouseEvent<HTMLElement>) {
    const surfaceSize = getAnnotationSurfaceSize();
    if (!surfaceSize || !annotationStart || !activeTool) {
      return;
    }

    claimAnnotationEvent(event);
    const point = readSurfacePoint(event, surfaceSize);
    const finalAnnotation = activeTool === "pen" && draftAnnotation?.type === "pen"
      ? draftAnnotation
      : annotationFromSelection(activeTool, annotationStart, point, annotationColor);

    setAnnotations((current) => addAnnotation({ annotations: current }, finalAnnotation).annotations);
    setRedoAnnotations([]);
    setDraftAnnotation(undefined);
    setAnnotationStart(undefined);
    setStatus("已添加标注");
  }

  function updateTextDraft(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setTextDraft((current) => current ? { ...current, value } : current);
  }

  function commitTextDraft() {
    if (!textDraft) {
      return;
    }

    const text = textDraft.value.trim();
    setTextDraft(undefined);
    if (!text) {
      setStatus("已取消文字标注");
      return;
    }

    setAnnotations((current) => addAnnotation({ annotations: current }, {
      type: "text",
      x: textDraft.x,
      y: textDraft.y,
      text,
      color: textDraft.color,
      fontSize: textDraft.fontSize,
    }).annotations);
    setRedoAnnotations([]);
    setStatus("已添加文字标注");
  }

  function handleTextDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTextDraft();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setTextDraft(undefined);
      setStatus("已取消文字标注");
    }
  }
  const renderedAnnotations = draftAnnotation ? [...annotations, draftAnnotation] : annotations;
  const isOcrOverlayVisible = Boolean(ocrText && showOcrOverlay);
  const toolbarStyle = selection && !capture
    ? createToolbarStyle(selection, windowTargetsRef.current, getFullscreenSelection())
    : undefined;

  const statusStyle = status && selection && !capture
    ? createStatusStyle(selection, windowTargetsRef.current, getFullscreenSelection())
    : undefined;

  function closeOverlay() {
    void window.petdex?.screenshot?.closeOverlay();
  }

  function beginSelectionMove(event: MouseEvent<HTMLElement>) {
    if (!selection || !selectionLocked || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectionDrag({
      mode: "move",
      origin: { x: event.clientX, y: event.clientY },
      selection,
    });
    setStatus("拖拽移动截图范围");
  }

  function beginSelectionResize(event: MouseEvent<HTMLElement>, handle: SelectionHandle) {
    if (!selection || !selectionLocked || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectionDrag({ mode: "resize", handle, selection });
    setStatus("拖拽调整截图范围");
  }

  function updateSelectionDrag(point: Point, bounds = getFullscreenSelection()) {
    if (!selectionDrag) {
      return;
    }

    const nextSelection = selectionDrag.mode === "move"
      ? moveSelectionWithinBounds(selectionDrag.selection, selectionDrag.origin, point, bounds)
      : resizeSelectionFromHandle(selectionDrag.selection, selectionDrag.handle, point, bounds);
    setSelection(nextSelection);
  }

  function setSelectionIfChanged(nextSelection: ScreenshotSelection) {
    setSelection((current) => selectionsEqual(current, nextSelection) ? current : nextSelection);
  }

  function trackPointer(point: Point) {
    if (capture) {
      return;
    }

    if (selectionDrag) {
      updateSelectionDrag(point);
      return;
    }

    if (start) {
      if (isManualSelectionDrag(point.x, point.y)) {
        setSelectionIfChanged(normalizeSelection(start.x, start.y, point.x, point.y));
        setStatus("拖拽选择截图区域");
      }
      return;
    }

    if (selectionLocked) {
      return;
    }

    const hoveredTarget = findScreenshotTargetAtPoint(windowTargetsRef.current, point);
    setSelectionIfChanged(hoveredTarget ?? getFullscreenSelection());
  }

  useEffect(() => {
    const api = window.petdex?.screenshot;
    const getCursorPoint = api?.getCursorPoint;
    if (!getCursorPoint || capture || (selectionLocked && !selectionDrag)) {
      return;
    }
    const pollCursorPoint = getCursorPoint;

    let cancelled = false;
    async function syncCursorPoint() {
      try {
        const point = await pollCursorPoint();
        if (cancelled || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          return;
        }

        if (point.displaySize) {
          setOverlaySize(point.displaySize);
        }

        if (point.displayChanged && point.displaySize) {
          if (selectionDrag) {
            windowTargetRequestRef.current += 1;
            replaceWindowTargets([]);
            updateSelectionDrag(point, getFullscreenSelection(point.displaySize));
            return;
          }

          setStart(undefined);
          setSelectionDrag(undefined);
          replaceWindowTargets([]);
          setSelectionIfChanged(getFullscreenSelection(point.displaySize));
          const targetRequestId = ++windowTargetRequestRef.current;
          void api?.listWindowTargets?.()
            .then((targets) => {
              if (!cancelled && targetRequestId === windowTargetRequestRef.current) {
                const nextTargets = targets ?? [];
                replaceWindowTargets(nextTargets);
                const hoveredTarget = findScreenshotTargetAtPoint(nextTargets, point);
                setSelectionIfChanged(hoveredTarget ?? getFullscreenSelection(point.displaySize));
              }
            })
            .catch(() => {
              if (!cancelled && targetRequestId === windowTargetRequestRef.current) {
                replaceWindowTargets([]);
              }
            });
          return;
        }
        trackPointer(point);
      } catch {
        // Mousemove still works when the cursor polling bridge is unavailable.
      }
    }

    void syncCursorPoint();
    const timer = window.setInterval(() => void syncCursorPoint(), 50);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [capture, selectionDrag, selectionLocked, start]);

  function renderOcrActions(detached = false) {
    return (
      <div
        className={`screenshot-ocr-actions${detached ? " screenshot-ocr-actions--detached" : ""}`}
        aria-label="OCR 操作"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseMove={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="screenshot-ocr-copy"
          aria-label="复制OCR结果"
          title="复制OCR结果"
          onClick={() => void copyOcrText()}
        >
          <Copy size={13} aria-hidden />
        </button>
        <button
          type="button"
          className="screenshot-ocr-toggle"
          aria-label={showOcrOverlay ? "显示原图" : "显示OCR"}
          title={showOcrOverlay ? "显示原图" : "显示OCR"}
          onClick={() => setShowOcrOverlay((visible) => !visible)}
        >
          {showOcrOverlay ? <ImageIcon size={13} aria-hidden /> : <ScanText size={13} aria-hidden />}
          <span>{showOcrOverlay ? "原图" : "OCR"}</span>
        </button>
      </div>
    );
  }

  function renderAnnotationEditor(size: { width: number; height: number }, selectionMode = false) {
    const layerSuffix = selectionMode ? " screenshot-layer--selection" : "";

    return (
      <>
        {renderedAnnotations.length > 0 && (
          <svg className={`screenshot-annotations${layerSuffix}`} aria-label="截图标注层" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
            {renderedAnnotations.map(renderAnnotation)}
          </svg>
        )}
        <div
          className={`screenshot-drawing-surface${layerSuffix}${selectionMode && !activeTool ? " screenshot-drawing-surface--move" : ""}`}
          aria-label="截图绘制层"
          onMouseDown={beginAnnotation}
          onMouseMove={moveAnnotation}
          onMouseUp={finishAnnotation}
          onMouseLeave={finishAnnotation}
          onDragStart={stopPreviewDrag}
        />
        {textDraft && (
          <div className={`screenshot-text-input-layer${layerSuffix}`}>
            <input
              aria-label="输入标注文字"
              autoFocus
              className="screenshot-text-input"
              style={{
                left: `${(textDraft.x / size.width) * 100}%`,
                top: `${(textDraft.y / size.height) * 100}%`,
                color: textDraft.color,
                borderColor: textDraft.color,
                fontSize: `${textDraft.fontSize}px`,
              }}
              value={textDraft.value}
              onChange={updateTextDraft}
              onKeyDown={handleTextDraftKeyDown}
              onBlur={commitTextDraft}
            />
          </div>
        )}
        {isOcrOverlayVisible && (
          <div className={`screenshot-ocr-layer${layerSuffix}`}>
            <section
              className="screenshot-ocr-overlay"
              aria-label="OCR 覆盖结果"
              onMouseDown={(event) => event.stopPropagation()}
              onMouseMove={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
            >
              <pre style={{ fontSize: `${readOcrOverlayFontSize(ocrText, size)}px` }}>{ocrText}</pre>
            </section>
            {renderOcrActions()}
          </div>
        )}
        {ocrText && !isOcrOverlayVisible && renderOcrActions(true)}
      </>
    );
  }

  return (
    <main
      className={`screenshot-overlay${capture ? " screenshot-overlay--captured" : ""}`}
      onMouseDown={(event) => {
        if (capture || event.button !== 0) {
          return;
        }

        setSelectionLocked(false);
        setSelectionDrag(undefined);
        setStart({ x: event.clientX, y: event.clientY });
      }}
      onMouseMove={(event) => {
        trackPointer({ x: event.clientX, y: event.clientY });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        closeOverlay();
      }}
      onMouseUp={(event) => {
        if (selectionDrag) {
          setSelectionDrag(undefined);
          setStatus("可继续调整范围，也可添加标注或 OCR；点击确定复制并关闭。");
          return;
        }

        finishSelection(event.clientX, event.clientY);
      }}
    >
      {selection && !capture && (
        <div
          className={`screenshot-selection${selectionLocked ? " screenshot-selection--locked" : ""}`}
          style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
          onMouseDown={beginSelectionMove}
        >
          {selectionLocked && renderAnnotationEditor({ width: selection.width, height: selection.height }, true)}
          {selectionLocked && selectionHandles.map((item) => (
            <button
              key={item.handle}
              type="button"
              className={`screenshot-selection-handle screenshot-selection-handle--${item.handle}`}
              aria-label={item.label}
              title={item.label}
              onMouseDown={(event) => beginSelectionResize(event, item.handle)}
            />
          ))}
        </div>
      )}
      {capture && (
        <section className="screenshot-preview" aria-label="截图结果" onDragStart={stopPreviewDrag}>
          <img src={capture.dataUrl} alt="截图预览" draggable={false} onDragStart={stopPreviewDrag} />
          {renderedAnnotations.length > 0 && (
            <svg className="screenshot-annotations" aria-label="截图标注层" viewBox={`0 0 ${capture.width} ${capture.height}`} preserveAspectRatio="none">
              {renderedAnnotations.map(renderAnnotation)}
            </svg>
          )}
          <div
            className="screenshot-drawing-surface"
            aria-label="截图绘制层"
            onMouseDown={beginAnnotation}
            onMouseMove={moveAnnotation}
            onMouseUp={finishAnnotation}
            onMouseLeave={finishAnnotation}
            onDragStart={stopPreviewDrag}
          />
          {textDraft && (
            <div className="screenshot-text-input-layer">
              <input
                aria-label="输入标注文字"
                autoFocus
                className="screenshot-text-input"
                style={{
                  left: `${(textDraft.x / capture.width) * 100}%`,
                  top: `${(textDraft.y / capture.height) * 100}%`,
                  color: textDraft.color,
                  borderColor: textDraft.color,
                  fontSize: `${textDraft.fontSize}px`,
                }}
                value={textDraft.value}
                onChange={updateTextDraft}
                onKeyDown={handleTextDraftKeyDown}
                onBlur={commitTextDraft}
              />
            </div>
          )}
          {isOcrOverlayVisible && (
            <div className="screenshot-ocr-layer">
              <section
                className="screenshot-ocr-overlay"
                aria-label="OCR 覆盖结果"
                onMouseDown={(event) => event.stopPropagation()}
                onMouseMove={(event) => event.stopPropagation()}
                onMouseUp={(event) => event.stopPropagation()}
              >
                <pre style={{ fontSize: `${readOcrOverlayFontSize(ocrText, capture)}px` }}>{ocrText}</pre>
              </section>
              {renderOcrActions()}
            </div>
          )}
          {ocrText && !isOcrOverlayVisible && renderOcrActions(true)}
        </section>
      )}
      {(selection || capture) && (
        <ScreenshotToolbar
          captured={Boolean(capture)}
          selectionLocked={selectionLocked}
          activeTool={activeTool}
          annotationColor={annotationColor}
          textFontSize={textFontSize}
          busyAction={busyAction}
          canUndo={annotations.length > 0}
          canRedo={redoAnnotations.length > 0}
          toolbarStyle={toolbarStyle}
          onToolChange={(tool) => setActiveTool(tool)}
          onAnnotationColorChange={setAnnotationColor}
          onTextFontSizeChange={setTextFontSize}
          onUndo={() => {
            setAnnotations((current) => {
              if (current.length === 0) {
                return current;
              }
              const removed = current[current.length - 1];
              setRedoAnnotations((redo) => [removed, ...redo]);
              return undoAnnotation({ annotations: current }).annotations;
            });
            setStatus("已撤销标注");
          }}
          onRedo={() => {
            setRedoAnnotations((current) => {
              const [next, ...rest] = current;
              if (!next) {
                return current;
              }
              setAnnotations((annotations) => addAnnotation({ annotations }, next).annotations);
              return rest;
            });
            setStatus("已重做标注");
          }}
          onClear={() => {
            setAnnotations((current) => current.length > 0 ? [] : current);
            setRedoAnnotations([]);
            setStatus("已清空标注");
          }}
          onConfirm={() => capture ? void runCaptureAction("confirm") : captureCurrentSelection()}
          onCopy={() => selectionLocked && !capture ? void runSelectionAction("copy") : void runCaptureAction("copy")}
          onSave={() => selectionLocked && !capture ? void runSelectionAction("save") : void runCaptureAction("save")}
          onOcr={() => selectionLocked && !capture ? void runSelectionAction("ocr") : void runCaptureAction("ocr")}
          onPin={() => selectionLocked && !capture ? void runSelectionAction("pin") : void runCaptureAction("pin")}
          onReset={resetCapture}
          onClose={closeOverlay}
        />
      )}
      {status && <p className="screenshot-status" role="status" style={statusStyle}>{status}</p>}
    </main>
  );
}

interface ScreenshotToolbarProps {
  captured: boolean;
  selectionLocked: boolean;
  activeTool?: AnnotationTool;
  annotationColor: string;
  textFontSize: number;
  busyAction: string;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange(tool: AnnotationTool): void;
  onAnnotationColorChange(color: string): void;
  onTextFontSizeChange(fontSize: number): void;
  onUndo(): void;
  onRedo(): void;
  onClear(): void;
  onConfirm(): void;
  onCopy(): void;
  onSave(): void;
  onOcr(): void;
  onPin(): void;
  onReset(): void;
  onClose(): void;
  toolbarStyle?: CSSProperties;
}

function IconButton({ label, pressed, disabled, className = "", onClick, children }: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`screenshot-icon-button${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ScreenshotToolbar({
  captured,
  selectionLocked,
  activeTool,
  annotationColor,
  textFontSize,
  busyAction,
  canUndo,
  canRedo,
  onToolChange,
  onAnnotationColorChange,
  onTextFontSizeChange,
  onUndo,
  onRedo,
  onClear,
  onConfirm,
  onCopy,
  onSave,
  onOcr,
  onPin,
  onReset,
  onClose,
  toolbarStyle,
}: ScreenshotToolbarProps) {
  const isBusy = Boolean(busyAction);
  const toolsDisabled = (!captured && !selectionLocked) || isBusy;
  const confirmDisabled = isBusy || (!captured && !selectionLocked);

  return (
    <div
      className="screenshot-toolbar"
      role="toolbar"
      aria-label="截图工具栏"
      style={toolbarStyle}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <div className="screenshot-toolbar-group">
        <IconButton label="矩形标注" pressed={activeTool === "rect"} disabled={toolsDisabled} onClick={() => onToolChange("rect")}>
          <Square size={21} aria-hidden />
        </IconButton>
        <IconButton label="箭头标注" pressed={activeTool === "arrow"} disabled={toolsDisabled} onClick={() => onToolChange("arrow")}>
          <ArrowUpRight size={22} aria-hidden />
        </IconButton>
        <IconButton label="画笔标注" pressed={activeTool === "pen"} disabled={toolsDisabled} onClick={() => onToolChange("pen")}>
          <PenLine size={21} aria-hidden />
        </IconButton>
        <IconButton label="文字标注" pressed={activeTool === "text"} disabled={toolsDisabled} onClick={() => onToolChange("text")}>
          <Type size={22} aria-hidden />
        </IconButton>
        <IconButton label="马赛克标注" pressed={activeTool === "mosaic"} disabled={toolsDisabled} onClick={() => onToolChange("mosaic")}>
          <SquareDashed size={21} aria-hidden />
        </IconButton>
      </div>

      <div className="screenshot-toolbar-group screenshot-color-group" aria-label="标注颜色">
        {annotationColors.map((color) => (
          <button
            key={color.value}
            type="button"
            className="screenshot-color-button"
            aria-label={`选择${color.label}`}
            aria-pressed={annotationColor === color.value}
            title={color.label}
            disabled={toolsDisabled}
            onClick={() => onAnnotationColorChange(color.value)}
          >
            <span className="screenshot-color-swatch" style={{ background: color.value }} />
          </button>
        ))}
      </div>

      <div className="screenshot-toolbar-group screenshot-text-size-group">
        <select
          className="screenshot-text-size-select"
          aria-label="文字字号"
          value={textFontSize}
          disabled={toolsDisabled || activeTool !== "text"}
          onChange={(event) => onTextFontSizeChange(Number(event.currentTarget.value))}
        >
          {textFontSizes.map((size) => (
            <option key={size} value={size}>{size}px</option>
          ))}
        </select>
      </div>

      <div className="screenshot-toolbar-group screenshot-toolbar-actions">
        <IconButton label="撤销标注" disabled={toolsDisabled || !canUndo} onClick={onUndo}>
          <Undo2 size={20} aria-hidden />
        </IconButton>
        <IconButton label="重做标注" disabled={toolsDisabled || !canRedo} onClick={onRedo}>
          <Redo2 size={20} aria-hidden />
        </IconButton>
        <IconButton label="清空标注" disabled={toolsDisabled || !canUndo} onClick={onClear}>
          <Trash2 size={20} aria-hidden />
        </IconButton>
        <IconButton label="复制截图" disabled={toolsDisabled} onClick={onCopy}>
          <Copy size={20} aria-hidden />
        </IconButton>
        <IconButton label="保存截图" disabled={toolsDisabled} onClick={onSave}>
          <Download size={20} aria-hidden />
        </IconButton>
        <IconButton label="OCR 识别" disabled={toolsDisabled} onClick={onOcr}>
          <ScanText size={20} aria-hidden />
        </IconButton>
        <IconButton label="钉住截图" disabled={toolsDisabled} onClick={onPin}>
          <Pin size={20} aria-hidden />
        </IconButton>
        <IconButton label="重新截图" disabled={isBusy} onClick={onReset}>
          <RefreshCcw size={20} aria-hidden />
        </IconButton>
        <IconButton label="关闭截图" className="screenshot-cancel-button" disabled={isBusy} onClick={onClose}>
          <X size={22} aria-hidden />
        </IconButton>
        <IconButton label="确定截图" className="screenshot-confirm-button" disabled={confirmDisabled} onClick={onConfirm}>
          <Check size={22} aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}





