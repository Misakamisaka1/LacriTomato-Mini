export interface Point {
  x: number;
  y: number;
}

export type Annotation =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { type: "arrow"; from: Point; to: Point; color: string }
  | { type: "pen"; points: Point[]; color: string; size: number }
  | { type: "text"; x: number; y: number; text: string; color: string; fontSize?: number }
  | { type: "highlight"; x: number; y: number; w: number; h: number; color: string }
  | { type: "mosaic"; points: Point[]; size: number; blockSize: number }
  | { type: "blur"; points: Point[]; size: number; radius: number };

export interface ScreenshotEditorState {
  annotations: Annotation[];
}

export function addAnnotation(state: ScreenshotEditorState, annotation: Annotation): ScreenshotEditorState {
  return { annotations: [...state.annotations, annotation] };
}

export function undoAnnotation(state: ScreenshotEditorState): ScreenshotEditorState {
  return { annotations: state.annotations.slice(0, -1) };
}

export interface AnnotationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function pointBounds(points: Point[], padding = 0): AnnotationBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.max(...xs) - left + padding),
    height: Math.max(1, Math.max(...ys) - top + padding),
  };
}

/** Bounding box of an annotation in its drawing-surface coordinates. */
export function getAnnotationBounds(annotation: Annotation): AnnotationBounds {
  if (annotation.type === "rect" || annotation.type === "highlight") {
    return { x: annotation.x, y: annotation.y, width: annotation.w, height: annotation.h };
  }

  if (annotation.type === "arrow") {
    return pointBounds([annotation.from, annotation.to], 6);
  }

  if (annotation.type === "text") {
    const fontSize = annotation.fontSize ?? 22;
    return {
      x: annotation.x,
      y: annotation.y - fontSize,
      width: Math.max(1, annotation.text.length * fontSize * 0.6),
      height: fontSize,
    };
  }

  return pointBounds(annotation.points, (annotation.size ?? 4) / 2 + 4);
}

/** Whether a point lands on an annotation (with a small click tolerance). */
export function hitTestAnnotation(annotation: Annotation, point: Point, tolerance = 6): boolean {
  if (annotation.type === "rect" || annotation.type === "highlight") {
    return point.x >= annotation.x - tolerance
      && point.x <= annotation.x + annotation.w + tolerance
      && point.y >= annotation.y - tolerance
      && point.y <= annotation.y + annotation.h + tolerance;
  }

  if (annotation.type === "arrow") {
    return distanceToSegment(point, annotation.from, annotation.to) <= tolerance + 4;
  }

  if (annotation.type === "text") {
    const bounds = getAnnotationBounds(annotation);
    return point.x >= bounds.x - tolerance
      && point.x <= bounds.x + bounds.width + tolerance
      && point.y >= bounds.y - tolerance
      && point.y <= bounds.y + bounds.height + tolerance;
  }

  // Freehand strokes (pen/mosaic/blur) hit when near any segment.
  const points = annotation.points;
  const size = annotation.size ?? 4;
  const threshold = Math.max(tolerance, size / 2 + 2);
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= threshold) {
      return true;
    }
  }

  if (points.length === 1) {
    return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= threshold;
  }

  return false;
}

/** Moves an annotation by a delta, returning a new annotation. */
export function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.type === "rect" || annotation.type === "highlight") {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }

  if (annotation.type === "arrow") {
    return {
      ...annotation,
      from: { x: annotation.from.x + dx, y: annotation.from.y + dy },
      to: { x: annotation.to.x + dx, y: annotation.to.y + dy },
    };
  }

  if (annotation.type === "text") {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }

  return {
    ...annotation,
    points: annotation.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}