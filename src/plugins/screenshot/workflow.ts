import type { Annotation } from "./types.js";

export interface ScreenshotSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface ScreenshotPoint {
  x: number;
  y: number;
}

export type SelectionHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type SelectionDragMode = "move" | "resize";

/**
 * Drag state shared across overlay windows. All coordinates are in the
 * absolute virtual-desktop DIP space so every overlay can render the same
 * logical selection clipped to its own display.
 */
export interface SelectionDragState {
  mode: SelectionDragMode;
  handle?: SelectionHandle;
  origin: ScreenshotPoint;
  selection: ScreenshotSelection;
}

export type AnnotationTool = "rect" | "arrow" | "pen" | "text" | "highlight" | "mosaic" | "blur";

export interface TextDraftState {
  x: number;
  y: number;
  value: string;
  color: string;
  fontSize: number;
}

/**
 * Authoritative screenshot session state, stored in the main process and
 * broadcast to every overlay window (one per display). Coordinates are in the
 * absolute virtual-desktop DIP space.
 */
export interface ScreenshotSessionState {
  /** Monotonic version; renderers use it to skip redundant session updates. */
  version: number;
  /** Absolute DIP bounds covering all displays (virtual desktop). */
  union: ScreenshotSelection;
  start?: ScreenshotPoint;
  selection?: ScreenshotSelection;
  selectionLocked: boolean;
  selectionDrag?: SelectionDragState;
  activeTool?: AnnotationTool;
  annotationColor: string;
  textFontSize: number;
  annotations: Annotation[];
  redoAnnotations: Annotation[];
  textDraft?: TextDraftState;
  status: string;
}

export interface ScreenshotCursorPoint extends ScreenshotPoint {
  displayChanged?: boolean;
  displayId?: number;
  displaySize?: ImageSize;
}

/** Extra payload returned by the cursor polling IPC on top of ScreenshotCursorPoint. */
export interface ScreenshotCursorSession extends ScreenshotCursorPoint {
  /** BrowserWindow id of the overlay currently under the cursor. */
  activeOverlayId?: number;
  /** Latest session snapshot so a freshly mounted overlay can bootstrap. */
  session?: ScreenshotSessionState;
}

/** Push-based cursor update broadcast by the main process to every overlay. */
export interface ScreenshotCursorUpdate {
  x: number;
  y: number;
  displayId: number;
  activeOverlayId?: number;
}

export interface ScreenshotSessionUpdate extends Partial<Omit<ScreenshotSessionState, "version" | "union">> {
  version?: number;
  union?: ScreenshotSelection;
}

export interface ScreenshotWindowTarget extends ScreenshotSelection {
  id: string;
  title: string;
}

export interface ScreenshotCaptureOptions {
  restoreOverlay?: boolean;
  /** How long to wait after hiding overlays before capturing (ms). */
  delayMs?: number;
}

export interface ScreenshotCaptureResult {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ScreenshotSaveResult {
  filePath: string;
}

export interface ScreenshotOcrLine {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

export interface ScreenshotOcrResult {
  text: string;
  confidence: number;
  /** Per-line bounding boxes so the renderer can overlay OCR at its real positions. */
  lines?: ScreenshotOcrLine[];
}

export function normalizeSelection(startX: number, startY: number, endX: number, endY: number): ScreenshotSelection {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function isUsableSelection(selection: ScreenshotSelection, minSize = 4) {
  return selection.width >= minSize && selection.height >= minSize;
}

export function createFullscreenSelection(size: ImageSize): ScreenshotSelection {
  return {
    x: 0,
    y: 0,
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}

export function findScreenshotTargetAtPoint(targets: ScreenshotWindowTarget[], point: ScreenshotPoint) {
  // Exclusive right/bottom edges, matching the main-process convention, so a
  // point on a shared edge between adjacent windows does not hit both.
  return targets.find((target) => (
    point.x >= target.x
    && point.x < target.x + target.width
    && point.y >= target.y
    && point.y < target.y + target.height
  ));
}

export function scaleSelectionToImageRect(
  selection: ScreenshotSelection,
  displaySize: ImageSize,
  imageSize: ImageSize,
): ScreenshotSelection {
  const scaleX = imageSize.width / displaySize.width;
  const scaleY = imageSize.height / displaySize.height;

  return {
    x: Math.max(0, Math.round(selection.x * scaleX)),
    y: Math.max(0, Math.round(selection.y * scaleY)),
    width: Math.max(1, Math.round(selection.width * scaleX)),
    height: Math.max(1, Math.round(selection.height * scaleY)),
  };
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function sanitizeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim() || "screenshot";
}

export function createScreenshotFilename(pattern: string, date = new Date(), extension = "png") {
  const replaced = pattern
    .replace(/yyyy/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/dd/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));

  const safeExtension = /^[a-z0-9]{2,5}$/i.test(extension) ? extension.toLowerCase() : "png";
  return `${sanitizeFilename(replaced).replace(/\.(png|jpe?g|webp)$/i, "")}.${safeExtension}`;
}