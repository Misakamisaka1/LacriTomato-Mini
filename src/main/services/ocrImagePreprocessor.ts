export interface OcrNativeImage {
  createFromBuffer(image: Buffer): OcrNativeImageInstance;
}

interface OcrNativeImageInstance {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  resize(options: { width: number; height: number; quality: "best" }): { isEmpty?(): boolean; toPNG(): Buffer };
}

const maxUpscaledDimension = 1600;
const maxScale = 2;
const minUsefulScale = 1.25;

function readImageScale(width: number, height: number) {
  const maxDimension = Math.max(width, height);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    return 1;
  }

  return Math.min(maxScale, maxUpscaledDimension / maxDimension);
}

export function createOcrImagePreprocessor(nativeImage: OcrNativeImage) {
  return (image: Buffer) => {
    try {
      const source = nativeImage.createFromBuffer(image);
      if (source.isEmpty()) {
        return image;
      }

      const size = source.getSize();
      const scale = readImageScale(size.width, size.height);
      if (scale < minUsefulScale) {
        return image;
      }

      const resized = source.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: "best",
      });
      if (resized.isEmpty?.()) {
        return image;
      }

      const output = resized.toPNG();
      return output.length > 0 ? output : image;
    } catch {
      return image;
    }
  };
}
