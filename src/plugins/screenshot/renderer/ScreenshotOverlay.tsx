import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref, type CSSProperties } from "react";
import { ArrowUpRight, Brush as BlurBrushIcon, Check, Copy, Download, Highlighter, Image as ImageIcon, PenLine, Pin, Redo2, RefreshCcw, ScanText, Square, SquareDashed, Trash2, Type, Undo2, X } from "lucide-react";
import { blurCanvasBrushPath, pixelateCanvasBrushPath } from "../mosaic";
import {
  addAnnotation,
  getAnnotationBounds,
  hitTestAnnotation,
  moveAnnotation as translateAnnotation,
  undoAnnotation,
  type Annotation,
  type AnnotationBounds,
  type Point,
} from "../types";
import {
  findScreenshotTargetAtPoint,
  isUsableSelection,
  normalizeSelection,
  type AnnotationTool,
  type ImageSize,
  type ScreenshotCaptureOptions,
  type ScreenshotCaptureResult,
  type ScreenshotOcrLine,
  type ScreenshotSelection,
  type ScreenshotSessionState,
  type ScreenshotSessionUpdate,
  type ScreenshotWindowTarget,
  type SelectionDragState,
  type SelectionHandle,
  type TextDraftState,
} from "../workflow";
import "./screenshot.css";

/**
 * Coordinate space: every overlay window (one per display) renders the SAME
 * logical session using ABSOLUTE virtual-desktop DIP coordinates. `displayX/Y`
 * (from the window query) convert DOM client coordinates to absolute ones, and
 * the main process broadcasts the shared session state to all overlays so the
 * selection, drag and annotations stay in sync across screens.
 */

const disconnectedMessage = "截图服务未连接，请重新启动应用。";

const manualSelectionThreshold = 3;
const defaultAnnotationColor = "#ff4d4f";
const defaultTextFontSize = 22;
const mosaicBrushSize = 28;
const mosaicBlockSize = 10;
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

const selectionMinSize = 4;
const blurBrushSize = 28;
const blurRadius = 8;
const toolbarDisplayMargin = 12;
const toolbarBottomMargin = 18;
const toolbarEstimatedWidth = 920;
const toolbarEstimatedHeight = 60;
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

interface OverlayChromeStyle {
  toolbar: CSSProperties;
  status: CSSProperties;
}

/**
 * Computes the toolbar and status-hint positions together so they can NEVER
 * overlap. The status is placed relative to the toolbar (below it when space
 * allows, otherwise on the opposite side of the selection or stacked above the
 * toolbar), instead of both anchoring to the same selection edge independently
 * (which stacked them on top of each other).
 */
function createOverlayChromeStyle(
  selection: ScreenshotSelection,
  display: { x: number; y: number; width: number; height: number },
  toolbarHeight = toolbarEstimatedHeight,
): OverlayChromeStyle {
  const availableWidth = Math.max(1, display.width - toolbarDisplayMargin * 2);
  const halfWidth = Math.min(toolbarEstimatedWidth / 2, availableWidth / 2);
  const minLeft = display.x + toolbarDisplayMargin + halfWidth;
  const maxLeft = display.x + display.width - toolbarDisplayMargin - halfWidth;
  const preferredLeft = selection.x + selection.width / 2;
  const left = maxLeft >= minLeft
    ? clamp(preferredLeft, minLeft, maxLeft)
    : display.x + display.width / 2;

  const displayTop = display.y + toolbarDisplayMargin;
  const displayBottom = display.y + display.height - toolbarDisplayMargin;
  const spaceBelow = displayBottom - (selection.y + selection.height) - toolbarBottomMargin;

  // Toolbar goes below the selection when it fits, otherwise above it. The
  // real measured height (when available) replaces the static estimate so the
  // status can never collide with the toolbar regardless of its rendered size.
  const toolbarBelow = spaceBelow >= toolbarHeight + toolbarDisplayMargin;
  const toolbarTop = toolbarBelow
    ? selection.y + selection.height + toolbarDisplayMargin
    : Math.max(displayTop, selection.y - toolbarHeight - toolbarBottomMargin);

  let statusTop: number;
  if (toolbarBelow) {
    // Enough room below the toolbar: status sits under it with a gap.
    if (spaceBelow >= toolbarHeight + toolbarDisplayMargin + statusToolbarGap + statusEstimatedHeight) {
      statusTop = toolbarTop + toolbarHeight + statusToolbarGap;
    } else {
      // Not enough room under the toolbar: flip the status above the selection.
      const aboveTop = Math.max(displayTop, selection.y - statusEstimatedHeight - toolbarBottomMargin);
      statusTop = aboveTop + statusEstimatedHeight <= selection.y - toolbarDisplayMargin
        ? aboveTop
        : Math.min(displayBottom - statusEstimatedHeight, toolbarTop + toolbarHeight + statusToolbarGap);
    }
  } else if (spaceBelow >= statusEstimatedHeight + toolbarDisplayMargin) {
    // Toolbar above; status goes below the selection where the space is free.
    statusTop = selection.y + selection.height + toolbarDisplayMargin;
  } else {
    // No room on either side of the selection: stack the status above the
    // toolbar, keeping the gap; fall back below the selection when even the
    // display top cannot fit it without touching the toolbar.
    const stackedTop = Math.max(displayTop, toolbarTop - statusToolbarGap - statusEstimatedHeight);
    statusTop = stackedTop + statusEstimatedHeight + statusToolbarGap <= toolbarTop
      ? stackedTop
      : Math.min(displayBottom - statusEstimatedHeight, selection.y + selection.height + toolbarDisplayMargin);
  }

  const leftStyle = `${Math.round(left - display.x)}px`;
  const maxWidth = `${Math.round(availableWidth)}px`;
  return {
    toolbar: {
      left: leftStyle,
      top: `${Math.round(toolbarTop - display.y)}px`,
      bottom: "auto",
      maxWidth,
    },
    status: {
      left: leftStyle,
      top: `${Math.round(statusTop - display.y)}px`,
      bottom: "auto",
      maxWidth,
    },
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
    return { type: "mosaic", points: [start, end], size: mosaicBrushSize, blockSize: mosaicBlockSize };
  }

  if (tool === "blur") {
    return { type: "blur", points: [start, end], size: blurBrushSize, radius: blurRadius };
  }

  if (tool === "highlight") {
    return { type: "highlight", x: selection.x, y: selection.y, w: selection.width, h: selection.height, color };
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

  if (annotation.type === "highlight") {
    return <rect key={index} x={annotation.x} y={annotation.y} width={annotation.w} height={annotation.h} fill={annotation.color} fillOpacity="0.3" stroke="none" />;
  }

  if (annotation.type === "mosaic") {
    const path = annotation.points.length > 1
      ? pointsToPath(annotation.points)
      : `M ${annotation.points[0]?.x ?? 0} ${annotation.points[0]?.y ?? 0} L ${(annotation.points[0]?.x ?? 0) + 0.01} ${annotation.points[0]?.y ?? 0}`;

    return (
      <path
        key={index}
        className="screenshot-mosaic-stroke"
        d={path}
        fill="none"
        strokeWidth={annotation.size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (annotation.type === "blur") {
    const path = annotation.points.length > 1
      ? pointsToPath(annotation.points)
      : `M ${annotation.points[0]?.x ?? 0} ${annotation.points[0]?.y ?? 0} L ${(annotation.points[0]?.x ?? 0) + 0.01} ${annotation.points[0]?.y ?? 0}`;

    return (
      <path
        key={index}
        className="screenshot-blur-stroke"
        d={path}
        fill="none"
        strokeWidth={annotation.size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  return null;
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

  if (annotation.type === "highlight") {
    context.globalAlpha = 0.3;
    context.fillStyle = annotation.color;
    context.fillRect(annotation.x, annotation.y, annotation.w, annotation.h);
    context.globalAlpha = 1;
  }

  if (annotation.type === "mosaic") {
    pixelateCanvasBrushPath(context, annotation.points, annotation.size, annotation.blockSize);
  }

  if (annotation.type === "blur") {
    blurCanvasBrushPath(context, annotation.points, annotation.size, annotation.radius);
  }

  context.restore();
}

/**
 * Flattens annotations onto the FULL-RESOLUTION capture so saved/copied output
 * keeps its pixel fidelity. The capture's public dataUrl is only a preview
 * thumbnail, so the renderer pulls the full-res PNG over IPC (raw bytes, no
 * base64) and composites onto a canvas of the capture's real dimensions.
 */
async function createFlattenedDataUrl(
  api: NonNullable<NonNullable<typeof window.petdex>["screenshot"]>,
  capture: ScreenshotCaptureResult,
  annotations: Annotation[],
  annotationSize = { width: capture.width, height: capture.height },
) {
  if (annotations.length === 0) {
    return capture.dataUrl;
  }

  if (navigator.userAgent.toLowerCase().includes("jsdom")) {
    return capture.dataUrl;
  }

  try {
    const fullResBytes = await api.getCaptureImage?.(capture.id);
    if (!fullResBytes || fullResBytes.byteLength === 0) {
      return capture.dataUrl;
    }

    const objectUrl = URL.createObjectURL(new Blob([fullResBytes], { type: "image/png" }));
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
        image.src = objectUrl;
      });
      context.drawImage(image, 0, 0, capture.width, capture.height);
      context.save();
      context.scale(capture.width / Math.max(1, annotationSize.width), capture.height / Math.max(1, annotationSize.height));
      annotations.forEach((annotation) => drawAnnotation(context, annotation));
      context.restore();
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
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
  // Each overlay window is created with its display geometry in the URL query.
  // Coordinates are absolute virtual-desktop DIPs: clientX + displayX.
  const query = new URLSearchParams(window.location.search);
  const windowId = Number(query.get("windowId") ?? 0);
  const displayId = Number(query.get("displayId") ?? 0);
  const displayX = Number(query.get("displayX") ?? 0);
  const displayY = Number(query.get("displayY") ?? 0);

  const [start, setStart] = useState<Point | undefined>();
  const [selection, setSelection] = useState<ScreenshotSelection | undefined>();
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [selectionDrag, setSelectionDrag] = useState<SelectionDragState | undefined>();
  const [, setWindowTargets] = useState<ScreenshotWindowTarget[]>([]);
  const windowTargetsRef = useRef<ScreenshotWindowTarget[]>([]);
  const windowTargetRequestRef = useRef(0);
  const [capture, setCapture] = useState<ScreenshotCaptureResult | undefined>();
  const [status, setStatus] = useState("");
  /** Static per-display snapshot powering the selection magnifier (loupe). */
  const [background, setBackground] = useState<{ width: number; height: number; dataUrl: string } | undefined>();
  const [loupePoint, setLoupePoint] = useState<Point | undefined>();
  const [ocrText, setOcrText] = useState("");
  const [ocrLines, setOcrLines] = useState<ScreenshotOcrLine[]>([]);
  const [showOcrOverlay, setShowOcrOverlay] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [activeTool, setActiveTool] = useState<AnnotationTool | undefined>();
  const [annotationColor, setAnnotationColor] = useState(defaultAnnotationColor);
  const [textFontSize, setTextFontSize] = useState(defaultTextFontSize);
  const [annotationStart, setAnnotationStart] = useState<Point | undefined>();
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | undefined>();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [redoAnnotations, setRedoAnnotations] = useState<Annotation[]>([]);
  /** Index of the annotation currently selected for move/resize/delete. */
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState<number | undefined>();
  /** Drag state while moving/resizing a selected annotation. */
  const [annotationDrag, setAnnotationDrag] = useState<{
    mode: "move" | "resize";
    origin: Point;
    startValue: Annotation;
  } | undefined>();
  const [textDraft, setTextDraft] = useState<TextDraftState | undefined>();
  const [overlaySize, setOverlaySize] = useState<ImageSize>({
    width: Number(query.get("displayWidth") ?? (window.innerWidth || 1)),
    height: Number(query.get("displayHeight") ?? (window.innerHeight || 1)),
  });
  const [activeOverlayId, setActiveOverlayId] = useState<number | undefined>();
  const sessionRef = useRef<ScreenshotSessionState | undefined>(undefined);
  const reportTimerRef = useRef<number | undefined>(undefined);
  const lastReportAtRef = useRef(0);
  /** Real rendered toolbar height (measured) so the status hint never overlaps it. */
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(toolbarEstimatedHeight);

  /**
   * Only the overlay currently under the cursor processes mouse input and
   * shows the toolbar/status; every overlay renders the shared session state.
   * After a capture the remaining overlay owns the preview regardless of the
   * cursor. windowId === 0 keeps direct (test/standalone) renders fully
   * interactive.
   */
  const isActive = Boolean(capture) || windowId === 0 || activeOverlayId === windowId;

  function getOwnDisplayLayout() {
    return {
      x: displayX,
      y: displayY,
      width: overlaySize?.width ?? Number(query.get("displayWidth") ?? 1),
      height: overlaySize?.height ?? Number(query.get("displayHeight") ?? 1),
    };
  }

  function getFullscreenSelection(): ScreenshotSelection {
    const layout = getOwnDisplayLayout();
    return {
      x: layout.x,
      y: layout.y,
      width: Math.max(1, Math.round(layout.width)),
      height: Math.max(1, Math.round(layout.height)),
    };
  }

  /** Drag/move bounds span the whole virtual desktop so selections can cross displays. */
  function getSelectionBounds(): ScreenshotSelection {
    return sessionRef.current?.union ?? getFullscreenSelection();
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

  /**
   * Applies the authoritative session state, skipping when nothing changed.
   * Broadcasts are field-level patches, so the update is merged over the last
   * known state instead of treated as a complete snapshot.
   */
  function applySession(next: ScreenshotSessionUpdate | undefined) {
    if (!next) {
      return;
    }

    const merged: ScreenshotSessionState = sessionRef.current
      ? { ...sessionRef.current, ...next }
      : next as ScreenshotSessionState;

    if (sessionRef.current && JSON.stringify(merged) === JSON.stringify(sessionRef.current)) {
      return;
    }

    sessionRef.current = merged;
    setStart(merged.start);
    setSelection(merged.selection);
    setSelectionLocked(merged.selectionLocked);
    setSelectionDrag(merged.selectionDrag);
    setActiveTool(merged.activeTool);
    setAnnotationColor(merged.annotationColor);
    setTextFontSize(merged.textFontSize);
    setAnnotations(merged.annotations);
    setRedoAnnotations(merged.redoAnnotations);
    setTextDraft(merged.textDraft);
    setStatus(merged.status);
  }

  useEffect(() => {
    const unsubscribe = window.petdex?.screenshot?.onSessionUpdate?.(applySession);
    return () => unsubscribe?.();
  }, []);

  // Report local state changes to the main process so every overlay stays in
  // sync. Only the active overlay reports (it owns the input); throttled to
  // avoid flooding IPC during drags.
  useEffect(() => {
    if (!isActive || capture) {
      return;
    }

    const api = window.petdex?.screenshot;
    if (!api?.reportSession) {
      return;
    }

    const payload: ScreenshotSessionUpdate = {
      start,
      selection,
      selectionLocked,
      selectionDrag,
      activeTool,
      annotationColor,
      textFontSize,
      annotations,
      redoAnnotations,
      textDraft,
      status,
    };

    const emit = () => {
      lastReportAtRef.current = Date.now();
      void api.reportSession?.(payload);
    };

    const elapsed = Date.now() - lastReportAtRef.current;
    if (elapsed >= 16) {
      emit();
    } else {
      if (reportTimerRef.current !== undefined) {
        window.clearTimeout(reportTimerRef.current);
      }
      reportTimerRef.current = window.setTimeout(emit, 16 - elapsed);
    }

    return () => {
      if (reportTimerRef.current !== undefined) {
        window.clearTimeout(reportTimerRef.current);
        reportTimerRef.current = undefined;
      }
    };
  }, [isActive, capture, start, selection, selectionLocked, selectionDrag, activeTool, annotationColor, textFontSize, annotations, redoAnnotations, textDraft, status]);

  function undoAnnotations() {
    setAnnotations((current) => {
      if (current.length === 0) {
        return current;
      }
      const removed = current[current.length - 1];
      setRedoAnnotations((redo) => [removed, ...redo]);
      return undoAnnotation({ annotations: current }).annotations;
    });
    setSelectedAnnotationIndex(undefined);
    setStatus("已撤销标注");
  }

  function redoAnnotationAction() {
    setRedoAnnotations((current) => {
      const [next, ...rest] = current;
      if (!next) {
        return current;
      }
      setAnnotations((currentAnnotations) => addAnnotation({ annotations: currentAnnotations }, next).annotations);
      return rest;
    });
    setSelectedAnnotationIndex(undefined);
    setStatus("已重做标注");
  }

  function clearAnnotations() {
    setAnnotations((current) => current.length > 0 ? [] : current);
    setRedoAnnotations([]);
    setSelectedAnnotationIndex(undefined);
    setAnnotationDrag(undefined);
    setStatus("已清空标注");
  }

  function nudgeSelection(dx: number, dy: number) {
    if (!selection || !selectionLocked || capture) {
      return;
    }

    setSelection(clampSelectionToBounds({ ...selection, x: selection.x + dx, y: selection.y + dy }, getSelectionBounds()));
    setStatus("已微调截图范围");
  }

  function deleteSelectedAnnotation() {
    setAnnotations((current) => {
      if (selectedAnnotationIndex === undefined || selectedAnnotationIndex >= current.length) {
        return current;
      }
      return current.filter((_, index) => index !== selectedAnnotationIndex);
    });
    setSelectedAnnotationIndex(undefined);
    setAnnotationDrag(undefined);
    setStatus("已删除标注");
  }

  // Keyboard shortcuts: the handler reads the latest state through a ref so the
  // window listener can be registered once.
  const keyHandlersRef = useRef({ handleKeyDown(_event: globalThis.KeyboardEvent): void { /* replaced below */ } });
  keyHandlersRef.current.handleKeyDown = (event) => {
    const target = event.target as HTMLElement | null;
    const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"));

    if (event.key === "Escape") {
      if (typing) {
        // The text annotation input handles Escape itself.
        return;
      }

      if (selectedAnnotationIndex !== undefined) {
        setSelectedAnnotationIndex(undefined);
        setAnnotationDrag(undefined);
        return;
      }

      closeOverlay();
      return;
    }

    if (typing) {
      return;
    }

    if (event.key === "Enter") {
      if (!busyAction) {
        event.preventDefault();
        if (capture) {
          void runCaptureAction("confirm");
        } else if (selectionLocked) {
          captureCurrentSelection();
        }
      }
      return;
    }

    const command = (event.ctrlKey || event.metaKey) && !event.altKey;
    if (command && event.key.toLowerCase() === "c") {
      event.preventDefault();
      if (busyAction) {
        return;
      }
      if (capture) {
        void runCaptureAction("copy");
      } else if (selectionLocked) {
        void runSelectionAction("copy");
      }
      return;
    }

    if (command && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (busyAction) {
        return;
      }
      if (capture) {
        void runCaptureAction("save");
      } else if (selectionLocked) {
        void runSelectionAction("save");
      }
      return;
    }

    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (busyAction || (!capture && !selectionLocked)) {
        return;
      }
      if (event.shiftKey) {
        redoAnnotationAction();
      } else {
        undoAnnotations();
      }
      return;
    }

    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      if (!busyAction && (capture || selectionLocked)) {
        redoAnnotationAction();
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedAnnotationIndex !== undefined) {
        event.preventDefault();
        deleteSelectedAnnotation();
      }
      return;
    }

    if (event.key.startsWith("Arrow")) {
      if (!selectionLocked || !selection || capture || busyAction) {
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      nudgeSelection(dx, dy);
      return;
    }
  };

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      keyHandlersRef.current.handleKeyDown(event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setSelection(getFullscreenSelection());
    setStatus("单击捕获整屏，移动到窗口可自动吸附，拖拽可手动框选。");

    let cancelled = false;
    const targetRequestId = ++windowTargetRequestRef.current;
    void window.petdex?.screenshot?.listWindowTargets?.()
      .then((targets) => {
        if (!cancelled && targetRequestId === windowTargetRequestRef.current) {
          replaceWindowTargets(targets ?? []);
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
    void window.petdex?.screenshot?.getBackground?.(displayId)
      .then((nextBackground) => {
        if (!cancelled && nextBackground) {
          setBackground(nextBackground);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setOcrLines([]);
      setShowOcrOverlay(false);
      setAnnotations([]);
      setRedoAnnotations([]);
      setSelectedAnnotationIndex(undefined);
      setStatus("截图已捕获");
    } catch (error) {
      setStatus(getErrorMessage(error, "截图失败"));
    } finally {
      setBusyAction("");
    }
  }

  function isManualSelectionDragPoint(origin: Point, endX: number, endY: number) {
    return Math.abs(endX - origin.x) >= manualSelectionThreshold || Math.abs(endY - origin.y) >= manualSelectionThreshold;
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
    setSelectedAnnotationIndex(undefined);
    setAnnotationDrag(undefined);
    setStatus("可拖拽移动范围，也可选择工具添加标注或 OCR；点击确定复制并关闭。");
  }

  function finishSelection(endX: number, endY: number) {
    if (!start) {
      return;
    }

    const nextSelection = isManualSelectionDragPoint(start, endX, endY)
      ? normalizeSelection(start.x, start.y, endX, endY)
      : selection ?? getFullscreenSelection();
    setStart(undefined);
    setLoupePoint(undefined);
    lockSelection(clampSelectionToBounds(nextSelection, getSelectionBounds()));
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

    const dataUrl = await createFlattenedDataUrl(api, result, annotations, { width: selection.width, height: selection.height });
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
        setOcrLines(result.lines ?? []);
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

    const dataUrl = await createFlattenedDataUrl(api, currentCapture, annotations);
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
        setOcrLines(result.lines ?? []);
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
    setOcrLines([]);
    setShowOcrOverlay(false);
    setAnnotations([]);
    setRedoAnnotations([]);
    setSelectedAnnotationIndex(undefined);
    setAnnotationDrag(undefined);
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
      // No tool selected: grab an existing annotation for move/resize/delete.
      const point = readSurfacePoint(event, surfaceSize);
      const hitIndex = annotations.findIndex((annotation) => hitTestAnnotation(annotation, point));
      if (hitIndex >= 0) {
        claimAnnotationEvent(event);
        setSelectedAnnotationIndex(hitIndex);
        setAnnotationDrag({ mode: "move", origin: point, startValue: annotations[hitIndex] });
        setStatus("拖拽移动标注，Delete 删除标注");
        return;
      }

      setSelectedAnnotationIndex(undefined);
      beginSelectionMove(event);
      return;
    }

    claimAnnotationEvent(event);
    const point = readSurfacePoint(event, surfaceSize);
    setSelectedAnnotationIndex(undefined);
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
      return;
    }

    if (activeTool === "mosaic") {
      setDraftAnnotation({ type: "mosaic", points: [point], size: mosaicBrushSize, blockSize: mosaicBlockSize });
      return;
    }

    if (activeTool === "blur") {
      setDraftAnnotation({ type: "blur", points: [point], size: blurBrushSize, radius: blurRadius });
      return;
    }

    setDraftAnnotation(annotationFromSelection(activeTool, point, point, annotationColor));
  }

  function beginAnnotationResize(event: MouseEvent<HTMLElement>) {
    if (selectedAnnotationIndex === undefined) {
      return;
    }

    claimAnnotationEvent(event);
    const surfaceSize = getAnnotationSurfaceSize();
    if (!surfaceSize) {
      return;
    }

    setAnnotationDrag({
      mode: "resize",
      origin: readSurfacePoint(event, surfaceSize),
      startValue: annotations[selectedAnnotationIndex],
    });
    setStatus("拖拽调整标注大小");
  }

  function updateAnnotationDrag(point: Point) {
    if (!annotationDrag || selectedAnnotationIndex === undefined) {
      return;
    }

    const dx = point.x - annotationDrag.origin.x;
    const dy = point.y - annotationDrag.origin.y;

    if (annotationDrag.mode === "move") {
      setAnnotations((current) => current.map((annotation, index) => (
        index === selectedAnnotationIndex ? translateAnnotation(annotationDrag.startValue, dx, dy) : annotation
      )));
      return;
    }

    const start = annotationDrag.startValue;
    if (start.type === "rect" || start.type === "highlight") {
      const width = Math.max(selectionMinSize, start.w + dx);
      const height = Math.max(selectionMinSize, start.h + dy);
      setAnnotations((current) => current.map((annotation, index) => (
        index === selectedAnnotationIndex ? { ...start, w: width, h: height } : annotation
      )));
    }
  }

  function moveAnnotation(event: MouseEvent<HTMLElement>) {
    const surfaceSize = getAnnotationSurfaceSize();
    if (!surfaceSize) {
      return;
    }

    if (annotationDrag) {
      claimAnnotationEvent(event);
      updateAnnotationDrag(readSurfacePoint(event, surfaceSize));
      return;
    }

    if (!annotationStart || !activeTool) {
      return;
    }

    claimAnnotationEvent(event);
    const point = readSurfacePoint(event, surfaceSize);
    if (activeTool === "pen") {
      setDraftAnnotation((current) => current?.type === "pen" ? { ...current, points: [...current.points, point] } : current);
      return;
    }

    if (activeTool === "mosaic") {
      setDraftAnnotation((current) => current?.type === "mosaic" ? { ...current, points: [...current.points, point] } : current);
      return;
    }

    if (activeTool === "blur") {
      setDraftAnnotation((current) => current?.type === "blur" ? { ...current, points: [...current.points, point] } : current);
      return;
    }

    setDraftAnnotation(annotationFromSelection(activeTool, annotationStart, point, annotationColor));
  }

  function finishAnnotation(event: MouseEvent<HTMLElement>) {
    const surfaceSize = getAnnotationSurfaceSize();
    if (!surfaceSize) {
      return;
    }

    if (annotationDrag) {
      claimAnnotationEvent(event);
      setAnnotationDrag(undefined);
      return;
    }

    if (!annotationStart || !activeTool) {
      return;
    }

    claimAnnotationEvent(event);
    const point = readSurfacePoint(event, surfaceSize);
    const finalAnnotation = activeTool === "pen" && draftAnnotation?.type === "pen"
      ? draftAnnotation
      : activeTool === "mosaic" && draftAnnotation?.type === "mosaic"
        ? { ...draftAnnotation, points: [...draftAnnotation.points, point] }
        : activeTool === "blur" && draftAnnotation?.type === "blur"
          ? { ...draftAnnotation, points: [...draftAnnotation.points, point] }
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
  const chromeStyle = selection && !capture
    ? createOverlayChromeStyle(selection, getOwnDisplayLayout(), toolbarHeight)
    : undefined;

  const toolbarStyle = chromeStyle?.toolbar;
  const statusStyle = chromeStyle && status ? chromeStyle.status : undefined;

  // Measure the real toolbar height once it renders and keep it in sync via
  // ResizeObserver; the chrome layout then places the status relative to the
  // actual toolbar instead of an estimate. jsdom reports 0, so the estimate
  // remains the fallback there (and in the very first paint).
  const showToolbar = Boolean(selection) && !capture;
  useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const height = element.offsetHeight;
      if (height > 0) {
        setToolbarHeight((current) => (current === height ? current : height));
      }
    };

    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }

    return undefined;
  }, [showToolbar, selectionLocked, capture]);

  function closeOverlay() {
    void window.petdex?.screenshot?.closeOverlay();
  }

  function beginSelectionMove(event: MouseEvent<HTMLElement>) {
    if (!isActive || !selection || !selectionLocked || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectionDrag({
      mode: "move",
      origin: { x: event.clientX + displayX, y: event.clientY + displayY },
      selection,
    });
    setStatus("拖拽移动截图范围");
  }

  function beginSelectionResize(event: MouseEvent<HTMLElement>, handle: SelectionHandle) {
    if (!isActive || !selection || !selectionLocked || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectionDrag({
      mode: "resize",
      handle,
      origin: { x: event.clientX + displayX, y: event.clientY + displayY },
      selection,
    });
    setStatus("拖拽调整截图范围");
  }

  function updateSelectionDrag(drag: SelectionDragState, point: Point, bounds: ScreenshotSelection) {
    const nextSelection = drag.mode === "move"
      ? moveSelectionWithinBounds(drag.selection, drag.origin, point, bounds)
      : resizeSelectionFromHandle(drag.selection, drag.handle ?? "se", point, bounds);
    setSelection(nextSelection);
  }

  function setSelectionIfChanged(nextSelection: ScreenshotSelection) {
    setSelection((current) => selectionsEqual(current, nextSelection) ? current : nextSelection);
  }

  function trackPointer(point: Point) {
    if (capture) {
      return;
    }

    // Fall back to the shared session state so a drag that started on another
    // display (or a selection currently spanning displays) continues here.
    const drag = selectionDrag ?? (selectionLocked ? sessionRef.current?.selectionDrag : undefined);
    if (drag) {
      setLoupePoint(undefined);
      updateSelectionDrag(drag, point, getSelectionBounds());
      return;
    }

    const activeStart = start ?? sessionRef.current?.start;
    if (activeStart) {
      setLoupePoint(point);
      if (isManualSelectionDragPoint(activeStart, point.x, point.y)) {
        setSelectionIfChanged(normalizeSelection(activeStart.x, activeStart.y, point.x, point.y));
        setStatus("拖拽选择截图区域");
      }
      return;
    }

    setLoupePoint(undefined);
    if (selectionLocked) {
      return;
    }

    const hoveredTarget = findScreenshotTargetAtPoint(windowTargetsRef.current, point);
    setSelectionIfChanged(hoveredTarget ?? getFullscreenSelection());
  }

  useEffect(() => {
    const api = window.petdex?.screenshot;
    let cancelled = false;
    let lastSessionVersion = -1;

    // One-time bootstrap: latest cursor plus the authoritative session snapshot,
    // so a freshly mounted overlay never depends on catching a broadcast.
    void api?.getCursorPoint?.()
      .then((point) => {
        if (cancelled) {
          return;
        }

        if (point.session && point.session.version !== lastSessionVersion) {
          lastSessionVersion = point.session.version;
          applySession(point.session);
        }

        if (point.activeOverlayId !== undefined) {
          setActiveOverlayId(point.activeOverlayId);
        }

        if (Number.isFinite(point.x) && Number.isFinite(point.y) && isActive) {
          trackPointer(point);
        }
      })
      .catch(() => {
        // Mousemove still works when the cursor polling bridge is unavailable.
      });

    // The main process polls the cursor and pushes only changes to every
    // overlay, replacing the per-overlay 50ms IPC polling loop.
    const unsubscribe = api?.onCursorUpdate?.((update) => {
      if (cancelled) {
        return;
      }

      if (update.activeOverlayId !== undefined) {
        setActiveOverlayId(update.activeOverlayId);
      }

      if (!Number.isFinite(update.x) || !Number.isFinite(update.y)) {
        return;
      }

      if (isActive) {
        trackPointer(update);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [isActive, capture, selectionDrag, selectionLocked, start]);

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

  function renderSelectedAnnotationBox(size: { width: number; height: number }) {
    const selected = selectedAnnotationIndex !== undefined ? renderedAnnotations[selectedAnnotationIndex] : undefined;
    if (!selected) {
      return null;
    }

    const bounds: AnnotationBounds = getAnnotationBounds(selected);
    const resizable = selected.type === "rect" || selected.type === "highlight";
    return (
      <div
        className="screenshot-annotation-selection"
        style={{
          left: `${(bounds.x / size.width) * 100}%`,
          top: `${(bounds.y / size.height) * 100}%`,
          width: `${(bounds.width / size.width) * 100}%`,
          height: `${(bounds.height / size.height) * 100}%`,
        }}
      >
        {resizable && (
          <button
            type="button"
            className="screenshot-annotation-resize"
            aria-label="调整标注大小"
            title="拖拽调整大小"
            onMouseDown={beginAnnotationResize}
          />
        )}
      </div>
    );
  }

  function renderOcrLines(size: { width: number; height: number }) {
    if (ocrLines.length === 0) {
      return <pre style={{ fontSize: `${readOcrOverlayFontSize(ocrText, size)}px` }}>{ocrText}</pre>;
    }

    return (
      <div className="screenshot-ocr-lines">
        {ocrLines.map((line, index) => (
          <div
            key={index}
            className="screenshot-ocr-line"
            style={{
              left: `${(line.bbox.x / size.width) * 100}%`,
              top: `${(line.bbox.y / size.height) * 100}%`,
              width: `${(line.bbox.width / size.width) * 100}%`,
              height: `${(line.bbox.height / size.height) * 100}%`,
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
    );
  }

  const loupeView = !capture && !selectionLocked && start && loupePoint && background
    ? (() => {
      const bgScale = background.width / Math.max(1, overlaySize.width);
      const zoom = 2 / Math.max(0.05, bgScale);
      const loupeWidth = 140;
      const loupeHeight = 92;
      return (
        <div
          className="screenshot-loupe"
          style={{
            left: `${loupePoint.x - displayX + 20}px`,
            top: `${loupePoint.y - displayY + 20}px`,
            width: `${loupeWidth}px`,
            height: `${loupeHeight}px`,
            backgroundImage: `url("${background.dataUrl}")`,
            backgroundSize: `${background.width * zoom}px ${background.height * zoom}px`,
            backgroundPosition: `${-(loupePoint.x * zoom) + loupeWidth / 2}px ${-(loupePoint.y * zoom) + loupeHeight / 2}px`,
          }}
        >
          <span className="screenshot-loupe-crosshair" aria-hidden />
        </div>
      );
    })()
    : null;

  function renderAnnotationEditor(size: { width: number; height: number }, selectionMode = false) {
    const layerSuffix = selectionMode ? " screenshot-layer--selection" : "";

    return (
      <>
        {renderedAnnotations.length > 0 && (
          <svg className={`screenshot-annotations${layerSuffix}`} aria-label="截图标注层" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
            {renderedAnnotations.map(renderAnnotation)}
          </svg>
        )}
        {renderSelectedAnnotationBox(size)}
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
              className={`screenshot-ocr-overlay${ocrLines.length > 0 ? " screenshot-ocr-overlay--lines" : ""}`}
              aria-label="OCR 覆盖结果"
              onMouseDown={(event) => event.stopPropagation()}
              onMouseMove={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
            >
              {renderOcrLines(size)}
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
        if (!isActive || capture || event.button !== 0) {
          return;
        }

        setSelectionLocked(false);
        setSelectionDrag(undefined);
        setStart({ x: event.clientX + displayX, y: event.clientY + displayY });
      }}
      onMouseMove={(event) => {
        if (!isActive) {
          return;
        }

        trackPointer({ x: event.clientX + displayX, y: event.clientY + displayY });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        closeOverlay();
      }}
      onMouseUp={(event) => {
        if (!isActive) {
          return;
        }

        if (selectionDrag) {
          setSelectionDrag(undefined);
          setStatus("可继续调整范围，也可添加标注或 OCR；点击确定复制并关闭。");
          return;
        }

        finishSelection(event.clientX + displayX, event.clientY + displayY);
      }}
    >
      {selection && !capture && (
        <div
          className={`screenshot-selection${selectionLocked ? " screenshot-selection--locked" : ""}`}
          style={{ left: selection.x - displayX, top: selection.y - displayY, width: selection.width, height: selection.height }}
          onMouseDown={beginSelectionMove}
          onDoubleClick={() => {
            if (selectionLocked && !busyAction) {
              captureCurrentSelection();
            }
          }}
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
        <section className="screenshot-preview" aria-label="截图结果" onDragStart={stopPreviewDrag} onDoubleClick={() => {
          if (!busyAction) {
            void runCaptureAction("confirm");
          }
        }}>
          <img src={capture.dataUrl} alt="截图预览" draggable={false} onDragStart={stopPreviewDrag} />
          {renderedAnnotations.length > 0 && (
            <svg className="screenshot-annotations" aria-label="截图标注层" viewBox={`0 0 ${capture.width} ${capture.height}`} preserveAspectRatio="none">
              {renderedAnnotations.map(renderAnnotation)}
            </svg>
          )}
          {renderSelectedAnnotationBox({ width: capture.width, height: capture.height })}
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
                className={`screenshot-ocr-overlay${ocrLines.length > 0 ? " screenshot-ocr-overlay--lines" : ""}`}
                aria-label="OCR 覆盖结果"
                onMouseDown={(event) => event.stopPropagation()}
                onMouseMove={(event) => event.stopPropagation()}
                onMouseUp={(event) => event.stopPropagation()}
              >
                {renderOcrLines(capture)}
              </section>
              {renderOcrActions()}
            </div>
          )}
          {ocrText && !isOcrOverlayVisible && renderOcrActions(true)}
        </section>
      )}
      {loupeView}
      {isActive && (selection || capture) && (
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
          toolbarRef={toolbarRef}
          onToolChange={(tool) => setActiveTool(tool)}
          onAnnotationColorChange={setAnnotationColor}
          onTextFontSizeChange={setTextFontSize}
          onUndo={undoAnnotations}
          onRedo={redoAnnotationAction}
          onClear={clearAnnotations}
          onConfirm={() => capture ? void runCaptureAction("confirm") : captureCurrentSelection()}
          onCopy={() => selectionLocked && !capture ? void runSelectionAction("copy") : void runCaptureAction("copy")}
          onSave={() => selectionLocked && !capture ? void runSelectionAction("save") : void runCaptureAction("save")}
          onOcr={() => selectionLocked && !capture ? void runSelectionAction("ocr") : void runCaptureAction("ocr")}
          onPin={() => selectionLocked && !capture ? void runSelectionAction("pin") : void runCaptureAction("pin")}
          onReset={resetCapture}
          onClose={closeOverlay}
        />
      )}
      {isActive && status && <p className="screenshot-status" role="status" style={statusStyle}>{status}</p>}
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
  toolbarRef?: Ref<HTMLDivElement>;
  onToolChange(tool: AnnotationTool | undefined): void;
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
  toolbarRef,
}: ScreenshotToolbarProps) {
  const isBusy = Boolean(busyAction);
  const toolsDisabled = (!captured && !selectionLocked) || isBusy;
  const confirmDisabled = isBusy || (!captured && !selectionLocked);

  function toggleTool(tool: AnnotationTool) {
    onToolChange(activeTool === tool ? undefined : tool);
  }

  return (
    <div
      ref={toolbarRef}
      className="screenshot-toolbar"
      role="toolbar"
      aria-label="截图工具栏"
      style={toolbarStyle}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <div className="screenshot-toolbar-group">
        <IconButton label="矩形标注" pressed={activeTool === "rect"} disabled={toolsDisabled} onClick={() => toggleTool("rect")}>
          <Square size={21} aria-hidden />
        </IconButton>
        <IconButton label="箭头标注" pressed={activeTool === "arrow"} disabled={toolsDisabled} onClick={() => toggleTool("arrow")}>
          <ArrowUpRight size={22} aria-hidden />
        </IconButton>
        <IconButton label="画笔标注" pressed={activeTool === "pen"} disabled={toolsDisabled} onClick={() => toggleTool("pen")}>
          <PenLine size={21} aria-hidden />
        </IconButton>
        <IconButton label="文字标注" pressed={activeTool === "text"} disabled={toolsDisabled} onClick={() => toggleTool("text")}>
          <Type size={22} aria-hidden />
        </IconButton>
        <IconButton label="高亮标注" pressed={activeTool === "highlight"} disabled={toolsDisabled} onClick={() => toggleTool("highlight")}>
          <Highlighter size={21} aria-hidden />
        </IconButton>
        <IconButton label="马赛克标注" pressed={activeTool === "mosaic"} disabled={toolsDisabled} onClick={() => toggleTool("mosaic")}>
          <SquareDashed size={21} aria-hidden />
        </IconButton>
        <IconButton label="模糊标注" pressed={activeTool === "blur"} disabled={toolsDisabled} onClick={() => toggleTool("blur")}>
          <BlurBrushIcon size={21} aria-hidden />
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





