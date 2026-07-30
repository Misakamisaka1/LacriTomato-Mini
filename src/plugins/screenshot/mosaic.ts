export interface MosaicPoint {
  x: number;
  y: number;
}

export interface MosaicRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeImageRect(rect: MosaicRect, width: number, height: number) {
  const x1 = rect.w >= 0 ? rect.x : rect.x + rect.w;
  const x2 = rect.w >= 0 ? rect.x + rect.w : rect.x;
  const y1 = rect.h >= 0 ? rect.y : rect.y + rect.h;
  const y2 = rect.h >= 0 ? rect.y + rect.h : rect.y;

  return {
    left: clamp(Math.floor(x1), 0, width),
    top: clamp(Math.floor(y1), 0, height),
    right: clamp(Math.ceil(x2), 0, width),
    bottom: clamp(Math.ceil(y2), 0, height),
  };
}

export function pixelateImageDataRegion(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  rect: MosaicRect,
  blockSize: number,
) {
  const result = new Uint8ClampedArray(source);
  if (width <= 0 || height <= 0 || source.length < width * height * 4) {
    return result;
  }

  const { left, top, right, bottom } = normalizeImageRect(rect, width, height);
  if (right <= left || bottom <= top) {
    return result;
  }

  const size = Math.max(1, Math.round(blockSize));
  for (let blockTop = top; blockTop < bottom; blockTop += size) {
    const blockBottom = Math.min(blockTop + size, bottom);

    for (let blockLeft = left; blockLeft < right; blockLeft += size) {
      const blockRight = Math.min(blockLeft + size, right);
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;

      for (let y = blockTop; y < blockBottom; y += 1) {
        for (let x = blockLeft; x < blockRight; x += 1) {
          const offset = (y * width + x) * 4;
          red += source[offset];
          green += source[offset + 1];
          blue += source[offset + 2];
          alpha += source[offset + 3];
          count += 1;
        }
      }

      const averageRed = Math.round(red / count);
      const averageGreen = Math.round(green / count);
      const averageBlue = Math.round(blue / count);
      const averageAlpha = Math.round(alpha / count);

      for (let y = blockTop; y < blockBottom; y += 1) {
        for (let x = blockLeft; x < blockRight; x += 1) {
          const offset = (y * width + x) * 4;
          result[offset] = averageRed;
          result[offset + 1] = averageGreen;
          result[offset + 2] = averageBlue;
          result[offset + 3] = averageAlpha;
        }
      }
    }
  }

  return result;
}

function markBrushPoint(mask: Uint8Array, width: number, height: number, point: MosaicPoint, brushSize: number) {
  const radius = Math.max(0.75, brushSize / 2);
  const radiusSquared = radius * radius;
  const left = clamp(Math.floor(point.x - radius), 0, width - 1);
  const right = clamp(Math.ceil(point.x + radius), 0, width - 1);
  const top = clamp(Math.floor(point.y - radius), 0, height - 1);
  const bottom = clamp(Math.ceil(point.y + radius), 0, height - 1);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x + 0.5 - point.x;
      const dy = y + 0.5 - point.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        mask[y * width + x] = 1;
      }
    }
  }
}

function createBrushMask(width: number, height: number, points: MosaicPoint[], brushSize: number) {
  const mask = new Uint8Array(width * height);
  if (width <= 0 || height <= 0 || points.length === 0) {
    return mask;
  }

  const stepSize = Math.max(1, brushSize / 3);
  points.forEach((point, index) => {
    if (index === 0) {
      markBrushPoint(mask, width, height, point, brushSize);
      return;
    }

    const previous = points[index - 1];
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / stepSize));
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      markBrushPoint(mask, width, height, {
        x: previous.x + (point.x - previous.x) * progress,
        y: previous.y + (point.y - previous.y) * progress,
      }, brushSize);
    }
  });

  return mask;
}

function getMaskBounds(mask: Uint8Array, width: number, height: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  return right >= left && bottom >= top ? { left, top, right: right + 1, bottom: bottom + 1 } : undefined;
}

export function pixelateImageDataBrushPath(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  points: MosaicPoint[],
  brushSize: number,
  blockSize: number,
) {
  const result = new Uint8ClampedArray(source);
  if (width <= 0 || height <= 0 || source.length < width * height * 4 || points.length === 0) {
    return result;
  }

  const mask = createBrushMask(width, height, points, Math.max(1, brushSize));
  const bounds = getMaskBounds(mask, width, height);
  if (!bounds) {
    return result;
  }

  const size = Math.max(1, Math.round(blockSize));
  const blockStartX = Math.floor(bounds.left / size) * size;
  const blockStartY = Math.floor(bounds.top / size) * size;

  for (let blockTop = blockStartY; blockTop < bounds.bottom; blockTop += size) {
    const blockBottom = Math.min(blockTop + size, height);

    for (let blockLeft = blockStartX; blockLeft < bounds.right; blockLeft += size) {
      const blockRight = Math.min(blockLeft + size, width);
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;

      for (let y = blockTop; y < blockBottom; y += 1) {
        for (let x = blockLeft; x < blockRight; x += 1) {
          if (!mask[y * width + x]) {
            continue;
          }

          const offset = (y * width + x) * 4;
          red += source[offset];
          green += source[offset + 1];
          blue += source[offset + 2];
          alpha += source[offset + 3];
          count += 1;
        }
      }

      if (count === 0) {
        continue;
      }

      const averageRed = Math.round(red / count);
      const averageGreen = Math.round(green / count);
      const averageBlue = Math.round(blue / count);
      const averageAlpha = Math.round(alpha / count);

      for (let y = blockTop; y < blockBottom; y += 1) {
        for (let x = blockLeft; x < blockRight; x += 1) {
          if (!mask[y * width + x]) {
            continue;
          }

          const offset = (y * width + x) * 4;
          result[offset] = averageRed;
          result[offset + 1] = averageGreen;
          result[offset + 2] = averageBlue;
          result[offset + 3] = averageAlpha;
        }
      }
    }
  }

  return result;
}

function transformPoint(matrix: DOMMatrix, x: number, y: number) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

function transformRect(rect: MosaicRect, matrix: DOMMatrix): MosaicRect {
  const points = [
    transformPoint(matrix, rect.x, rect.y),
    transformPoint(matrix, rect.x + rect.w, rect.y),
    transformPoint(matrix, rect.x, rect.y + rect.h),
    transformPoint(matrix, rect.x + rect.w, rect.y + rect.h),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);

  return {
    x: left,
    y: top,
    w: Math.max(...xs) - left,
    h: Math.max(...ys) - top,
  };
}

function transformPoints(points: MosaicPoint[], matrix: DOMMatrix) {
  return points.map((point) => transformPoint(matrix, point.x, point.y));
}

export function pixelateCanvasRegion(context: CanvasRenderingContext2D, rect: MosaicRect, blockSize: number) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  if (width <= 0 || height <= 0) {
    return;
  }

  const transform = context.getTransform();
  const scaleX = Math.hypot(transform.a, transform.b);
  const scaleY = Math.hypot(transform.c, transform.d);
  const scaledBlockSize = Math.max(1, Math.round(blockSize * (Math.max(scaleX, scaleY) || 1)));
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = pixelateImageDataRegion(
    imageData.data,
    width,
    height,
    transformRect(rect, transform),
    scaledBlockSize,
  );

  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);
}

export function pixelateCanvasBrushPath(
  context: CanvasRenderingContext2D,
  points: MosaicPoint[],
  brushSize: number,
  blockSize: number,
) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  if (width <= 0 || height <= 0 || points.length === 0) {
    return;
  }

  const transform = context.getTransform();
  const scaleX = Math.hypot(transform.a, transform.b);
  const scaleY = Math.hypot(transform.c, transform.d);
  const scale = Math.max(scaleX, scaleY) || 1;
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = pixelateImageDataBrushPath(
    imageData.data,
    width,
    height,
    transformPoints(points, transform),
    brushSize * scale,
    blockSize * scale,
  );

  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);
}