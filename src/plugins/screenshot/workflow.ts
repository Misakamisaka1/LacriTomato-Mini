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

export interface ScreenshotCursorPoint extends ScreenshotPoint {
  displayChanged?: boolean;
  displayId?: number;
  displaySize?: ImageSize;
}

export interface ScreenshotWindowTarget extends ScreenshotSelection {
  id: string;
  title: string;
}

export interface ScreenshotCaptureOptions {
  restoreOverlay?: boolean;
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

export interface ScreenshotOcrResult {
  text: string;
  confidence: number;
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
  return targets.find((target) => (
    point.x >= target.x
    && point.x <= target.x + target.width
    && point.y >= target.y
    && point.y <= target.y + target.height
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

export function createScreenshotFilename(pattern: string, date = new Date()) {
  const replaced = pattern
    .replace(/yyyy/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/dd/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));

  return `${sanitizeFilename(replaced).replace(/\.png$/i, "")}.png`;
}