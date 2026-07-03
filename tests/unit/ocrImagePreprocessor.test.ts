import { describe, expect, it, vi } from "vitest";
import { createOcrImagePreprocessor } from "../../src/main/services/ocrImagePreprocessor";

function createNativeImageMock(size: { width: number; height: number }, resizedPng = Buffer.from([9])) {
  const resizedImage = {
    toPNG: vi.fn(() => resizedPng),
  };
  const sourceImage = {
    isEmpty: vi.fn(() => false),
    getSize: vi.fn(() => size),
    resize: vi.fn(() => resizedImage),
  };

  return {
    nativeImage: {
      createFromBuffer: vi.fn(() => sourceImage),
    },
    sourceImage,
    resizedImage,
  };
}

describe("ocr image preprocessor", () => {
  it("upscales small screenshots before OCR", () => {
    const input = Buffer.from([1, 2, 3]);
    const output = Buffer.from([9, 8, 7]);
    const { nativeImage, sourceImage } = createNativeImageMock({ width: 320, height: 120 }, output);
    const preprocess = createOcrImagePreprocessor(nativeImage);

    expect(preprocess(input)).toBe(output);
    expect(nativeImage.createFromBuffer).toHaveBeenCalledWith(input);
    expect(sourceImage.resize).toHaveBeenCalledWith({ width: 640, height: 240, quality: "best" });
  });

  it("leaves large or invalid images unchanged", () => {
    const largeInput = Buffer.from([1]);
    const large = createNativeImageMock({ width: 1800, height: 900 });
    const preprocessLarge = createOcrImagePreprocessor(large.nativeImage);

    expect(preprocessLarge(largeInput)).toBe(largeInput);
    expect(large.sourceImage.resize).not.toHaveBeenCalled();

    const emptyInput = Buffer.from([2]);
    const emptyImage = {
      isEmpty: vi.fn(() => true),
      getSize: vi.fn(() => ({ width: 0, height: 0 })),
      resize: vi.fn(),
    };
    const emptyNativeImage = {
      createFromBuffer: vi.fn(() => emptyImage),
    };
    const preprocessEmpty = createOcrImagePreprocessor(emptyNativeImage);

    expect(preprocessEmpty(emptyInput)).toBe(emptyInput);
    expect(emptyImage.resize).not.toHaveBeenCalled();
  });
});
