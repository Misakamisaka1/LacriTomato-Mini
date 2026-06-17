import { useState } from "react";
import "./screenshot.css";

interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ScreenshotOverlay() {
  const [start, setStart] = useState<{ x: number; y: number } | undefined>();
  const [selection, setSelection] = useState<Selection | undefined>();

  return (
    <main
      className="screenshot-overlay"
      onMouseDown={(event) => setStart({ x: event.clientX, y: event.clientY })}
      onMouseMove={(event) => {
        if (!start) return;
        setSelection({
          x: Math.min(start.x, event.clientX),
          y: Math.min(start.y, event.clientY),
          w: Math.abs(event.clientX - start.x),
          h: Math.abs(event.clientY - start.y),
        });
      }}
      onMouseUp={() => setStart(undefined)}
    >
      {selection && (
        <div
          className="screenshot-selection"
          style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
        />
      )}
      {selection && <ScreenshotToolbar />}
    </main>
  );
}

function ScreenshotToolbar() {
  return (
    <div className="screenshot-toolbar">
      <button type="button">复制</button>
      <button type="button">保存</button>
      <button type="button">OCR</button>
      <button type="button">矩形</button>
      <button type="button">箭头</button>
      <button type="button">画笔</button>
      <button type="button">文字</button>
      <button type="button">马赛克</button>
      <button type="button">撤销</button>
    </div>
  );
}
