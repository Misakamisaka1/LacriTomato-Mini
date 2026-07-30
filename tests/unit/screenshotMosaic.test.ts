import { describe, expect, it } from "vitest";
import { pixelateImageDataBrushPath, pixelateImageDataRegion } from "../../src/plugins/screenshot/mosaic";

function createGrayscalePixels(values: number[]) {
  const pixels = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, index) => {
    const offset = index * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  });
  return pixels;
}

describe("screenshot mosaic", () => {
  it("rewrites pixels in the selected region into averaged mosaic blocks", () => {
    const pixels = createGrayscalePixels([
      10, 20, 80, 90,
      30, 40, 100, 110,
      150, 160, 220, 230,
      170, 180, 240, 250,
    ]);

    const result = pixelateImageDataRegion(pixels, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 2);

    expect(Array.from(result.filter((_, index) => index % 4 === 0))).toEqual([
      25, 25, 95, 95,
      25, 25, 95, 95,
      165, 165, 235, 235,
      165, 165, 235, 235,
    ]);
    expect(result).not.toEqual(pixels);
  });

  it("rewrites only pixels touched by a mosaic brush path", () => {
    const pixels = createGrayscalePixels([
      10, 20, 30, 40, 50,
      60, 70, 80, 90, 100,
      110, 120, 130, 140, 150,
      160, 170, 180, 190, 200,
      210, 220, 230, 240, 250,
    ]);

    const result = pixelateImageDataBrushPath(
      pixels,
      5,
      5,
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
      1,
      2,
    );

    expect(Array.from(result.slice(0, 5 * 4))).toEqual(Array.from(pixels.slice(0, 5 * 4)));
    expect(Array.from(result.slice(2 * 5 * 4, 3 * 5 * 4))).not.toEqual(Array.from(pixels.slice(2 * 5 * 4, 3 * 5 * 4)));
    expect(Array.from(result.slice(4 * 5 * 4, 5 * 5 * 4))).toEqual(Array.from(pixels.slice(4 * 5 * 4, 5 * 5 * 4)));
  });
});
