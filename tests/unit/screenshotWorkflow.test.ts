import { describe, expect, it } from "vitest";
import {
  createFullscreenSelection,
  createScreenshotFilename,
  findScreenshotTargetAtPoint,
  scaleSelectionToImageRect,
} from "../../src/plugins/screenshot/workflow";

describe("screenshot workflow", () => {
  it("scales a display selection to the captured image pixel rectangle", () => {
    expect(scaleSelectionToImageRect(
      { x: 10, y: 20, width: 100, height: 80 },
      { width: 500, height: 400 },
      { width: 1000, height: 800 },
    )).toEqual({ x: 20, y: 40, width: 200, height: 160 });
  });

  it("creates timestamped filenames from the configured pattern and format", () => {
    expect(createScreenshotFilename("lacritomato-yyyyMMdd-HHmmss", new Date("2026-06-22T04:05:06")))
      .toBe("lacritomato-20260622-040506.png");
    expect(createScreenshotFilename("lacritomato-yyyyMMdd-HHmmss", new Date("2026-06-22T04:05:06"), "jpg"))
      .toBe("lacritomato-20260622-040506.jpg");
    // A pattern that already ends in an image extension is replaced, not doubled.
    expect(createScreenshotFilename("my-shot.png", new Date("2026-06-22T04:05:06"), "jpg"))
      .toBe("my-shot.jpg");
  });

  it("creates a full screen default selection and picks the first target under the pointer", () => {
    expect(createFullscreenSelection({ width: 1280, height: 720 })).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    expect(findScreenshotTargetAtPoint([
      { id: "top", title: "顶层", x: 100, y: 80, width: 200, height: 160 },
      { id: "bottom", title: "底层", x: 0, y: 0, width: 600, height: 400 },
    ], { x: 140, y: 120 })).toEqual({ id: "top", title: "顶层", x: 100, y: 80, width: 200, height: 160 });
    expect(findScreenshotTargetAtPoint([
      { id: "target", title: "窗口", x: 20, y: 30, width: 200, height: 100 },
    ], { x: 500, y: 500 })).toBeUndefined();
    // Exclusive edges: a point exactly on the shared right edge hits only the
    // underlying window, not both.
    expect(findScreenshotTargetAtPoint([
      { id: "top", title: "顶层", x: 100, y: 80, width: 200, height: 160 },
      { id: "bottom", title: "底层", x: 0, y: 0, width: 600, height: 400 },
    ], { x: 300, y: 120 })).toEqual({ id: "bottom", title: "底层", x: 0, y: 0, width: 600, height: 400 });
  });
});