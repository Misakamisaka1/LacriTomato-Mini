export interface Point {
  x: number;
  y: number;
}

export type Annotation =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { type: "arrow"; from: Point; to: Point; color: string }
  | { type: "pen"; points: Point[]; color: string; size: number }
  | { type: "text"; x: number; y: number; text: string; color: string; fontSize?: number }
  | { type: "mosaic"; points: Point[]; size: number; blockSize: number };

export interface ScreenshotEditorState {
  annotations: Annotation[];
}

export function addAnnotation(state: ScreenshotEditorState, annotation: Annotation): ScreenshotEditorState {
  return { annotations: [...state.annotations, annotation] };
}

export function undoAnnotation(state: ScreenshotEditorState): ScreenshotEditorState {
  return { annotations: state.annotations.slice(0, -1) };
}
