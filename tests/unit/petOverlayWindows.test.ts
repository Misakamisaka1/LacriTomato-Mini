import { describe, expect, it } from "vitest";
import {
  getPetBubbleOverlayBounds,
  getPetMenuOverlayLayout,
} from "../../src/main/windows/petOverlayWindows";

const workArea = { x: 0, y: 0, width: 500, height: 400 };

describe("pet overlay window layout", () => {
  it("places a menu above the pet when there is enough horizontal room", () => {
    const layout = getPetMenuOverlayLayout(
      { x: 150, y: 200, width: 120, height: 128 },
      workArea,
      3,
    );

    expect(layout).toEqual({
      placement: "top",
      bounds: { x: 108, y: 138, width: 204, height: 54 },
    });
  });

  it("places the menu to the available side near screen edges", () => {
    expect(getPetMenuOverlayLayout({ x: 0, y: 200, width: 120, height: 128 }, workArea, 3)).toEqual({
      placement: "right",
      bounds: { x: 128, y: 154, width: 64, height: 174 },
    });

    expect(getPetMenuOverlayLayout({ x: 380, y: 200, width: 120, height: 128 }, workArea, 3)).toEqual({
      placement: "left",
      bounds: { x: 308, y: 154, width: 64, height: 174 },
    });
  });

  it("keeps a short bubble close to the pet head and clamped inside the display", () => {
    expect(getPetBubbleOverlayBounds({ x: 150, y: 200, width: 120, height: 128 }, workArea)).toEqual({
      x: 50,
      y: 124,
      width: 320,
      height: 72,
    });

    expect(getPetBubbleOverlayBounds({ x: -20, y: 200, width: 120, height: 128 }, workArea)).toEqual({
      x: 24,
      y: 124,
      width: 320,
      height: 72,
    });
  });
});
