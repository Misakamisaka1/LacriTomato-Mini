import { describe, expect, it } from "vitest";
import { mapWindowTargetsToOverlay } from "../../src/main/services/windowTargetService";

describe("screenshot window targets", () => {
  it("clips native window bounds to the virtual desktop and filters the current process", () => {
    expect(mapWindowTargetsToOverlay([
      { id: "self", title: "LacriTomato", x: 20, y: 20, width: 300, height: 200, processId: 42 },
      { id: "visible", title: "浏览器", x: 120, y: 140, width: 500, height: 320, processId: 99 },
      { id: "outside", title: "其它屏幕", x: 2000, y: 2000, width: 300, height: 200, processId: 99 },
    ], { x: 100, y: 100, width: 800, height: 600 }, 42)).toEqual([
      // Coordinates stay absolute so every overlay can share the same list
      { id: "visible", title: "浏览器", x: 120, y: 140, width: 500, height: 320 },
    ]);
  });
});