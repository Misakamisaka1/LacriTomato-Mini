import { describe, expect, it } from "vitest";
import { getPetSpriteBounds, getPetStatusOverlayLayout } from "../../src/main/windows/petOverlayWindows";
import { petVitalsPanelSizes } from "../../src/shared/petVitals";

const workArea = { x: 0, y: 0, width: 900, height: 600 };
const compact = petVitalsPanelSizes.compact;
// Card centre aligned with the pet's head, 28% down the sprite.
const headY = (sprite: { y: number; height: number }) =>
  Math.round(sprite.y + sprite.height * 0.28 - compact.height / 2);

describe("pet vitals overlay layout", () => {
  it("hangs the status card next to the pet's head by default", () => {
    const pet = { x: 300, y: 300, width: 120, height: 224 };
    const layout = getPetStatusOverlayLayout(pet, workArea, compact);

    expect(layout.placement).toBe("right");
    expect(layout.bounds).toEqual({
      x: 300 + 120 + 8,
      y: headY(pet),
      width: compact.width,
      height: compact.height,
    });
  });

  it("stays close to a sprite that only fills part of its window", () => {
    const windowBounds = { x: 300, y: 100, width: 200, height: 360 };
    const sprite = getPetSpriteBounds(windowBounds, { width: 160, height: 224 });

    expect(sprite).toEqual({ x: 320, y: 236, width: 160, height: 224 });

    const layout = getPetStatusOverlayLayout(sprite, workArea, compact);
    expect(layout.bounds.x).toBe(320 + 160 + 8);
    expect(layout.bounds.y).toBe(headY(sprite));
  });

  it("falls back to the window bounds when the sprite size is unknown", () => {
    const windowBounds = { x: 300, y: 100, width: 200, height: 360 };

    expect(getPetSpriteBounds(windowBounds, undefined)).toEqual(windowBounds);
    expect(getPetSpriteBounds(windowBounds, { width: 0, height: 0 })).toEqual(windowBounds);
    // A body taller than its window is nonsense, so it is ignored too.
    expect(getPetSpriteBounds(windowBounds, { width: 200, height: 400 })).toEqual(windowBounds);
  });

  it("flips to the left when the pet stands near the right edge", () => {
    const layout = getPetStatusOverlayLayout({ x: 740, y: 300, width: 120, height: 224 }, workArea, compact);

    expect(layout.placement).toBe("left");
    expect(layout.bounds.x).toBe(740 - 8 - compact.width);
  });

  it("keeps a clamped card on screen when neither side fits", () => {
    const narrowWorkArea = { x: 0, y: 0, width: 320, height: 600 };
    const layout = getPetStatusOverlayLayout({ x: 120, y: 300, width: 120, height: 224 }, narrowWorkArea, compact);

    expect(layout.bounds.x).toBe(24);
    expect(layout.bounds.x + layout.bounds.width).toBeLessThanOrEqual(narrowWorkArea.width);
  });

  it("clamps the card inside the work area vertically", () => {
    const layout = getPetStatusOverlayLayout(
      { x: 300, y: 10, width: 120, height: 224 },
      workArea,
      petVitalsPanelSizes.expanded,
    );

    expect(layout.bounds.y).toBe(24);
    expect(layout.bounds.y + layout.bounds.height).toBeLessThanOrEqual(workArea.height);
  });
});