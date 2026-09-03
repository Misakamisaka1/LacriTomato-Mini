import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ScreenshotOcrLine } from "../../plugins/screenshot/workflow.js";

export interface OcrOptions {
  mode: "local" | "model";
  languages: string[];
}

export interface OcrResult {
  text: string;
  confidence: number;
  lines?: ScreenshotOcrLine[];
}

export interface OcrService {
  recognize(image: Buffer, options: OcrOptions): Promise<OcrResult>;
}

export interface OcrServiceOptions {
  trainedDataPath?: string;
  cacheSize?: number;
  preprocessImage?: (image: Buffer) => Buffer | Promise<Buffer>;
}

type TesseractCreateWorker = typeof import("tesseract.js")["createWorker"];
type TesseractWorker = Awaited<ReturnType<TesseractCreateWorker>>;
type TesseractModule = typeof import("tesseract.js") & {
  default?: {
    createWorker?: TesseractCreateWorker;
  };
};

const defaultLanguages = ["chi_sim", "eng"];
const defaultCacheSize = 20;
const localOcrEngineMode = 1;

function getTesseractCreateWorker(tesseract: TesseractModule): TesseractCreateWorker {
  const createWorker = tesseract.default?.createWorker ?? tesseract.createWorker;
  if (!createWorker) {
    throw new Error("Tesseract createWorker API is unavailable");
  }

  return createWorker;
}

function normalizeLanguages(languages: string[]) {
  const normalized = [...new Set(languages.map((language) => language.trim()).filter(Boolean))];
  return (normalized.length > 0 ? normalized : defaultLanguages).sort();
}

function createCacheKey(image: Buffer, languages: string[]) {
  const hash = createHash("sha256").update(image).digest("hex");
  return `${languages.join("+")}:${hash}`;
}

function findLocalTrainedDataPath(languages: string[], trainedDataPath: string) {
  if (languages.every((language) => existsSync(join(trainedDataPath, `${language}.traineddata`)))) {
    return trainedDataPath;
  }

  return undefined;
}

function cloneResult(result: OcrResult): OcrResult {
  return {
    text: result.text,
    confidence: result.confidence,
    lines: result.lines?.map((line) => ({ ...line, bbox: { ...line.bbox } })),
  };
}

function readConfidence(value: unknown) {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? confidence : 0;
}

interface TesseractLine {
  text?: unknown;
  confidence?: unknown;
  bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
}

function readOcrLines(data: unknown): ScreenshotOcrLine[] | undefined {
  const source = data as { lines?: unknown } | null;
  if (!source || !Array.isArray(source.lines)) {
    return undefined;
  }

  const lines = source.lines.flatMap((line): ScreenshotOcrLine[] => {
    const candidate = line as TesseractLine;
    if (!candidate || typeof candidate.text !== "string" || !candidate.bbox) {
      return [];
    }

    const left = Number(candidate.bbox.x0);
    const top = Number(candidate.bbox.y0);
    const right = Number(candidate.bbox.x1);
    const bottom = Number(candidate.bbox.y1);
    if (![left, top, right, bottom].every(Number.isFinite)) {
      return [];
    }

    const text = candidate.text.trim();
    if (!text) {
      return [];
    }

    return [{
      text,
      bbox: {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      },
      confidence: readConfidence(candidate.confidence),
    }];
  });

  return lines.length > 0 ? lines : undefined;
}

export function createOcrService(options: OcrServiceOptions = {}): OcrService {
  const trainedDataPath = options.trainedDataPath ?? process.cwd();
  const cacheSize = options.cacheSize ?? defaultCacheSize;
  const preprocessImage = options.preprocessImage ?? ((image: Buffer) => image);
  const cache = new Map<string, OcrResult>();
  let worker: TesseractWorker | undefined;
  let workerLanguagesKey = "";
  let queue = Promise.resolve();

  function remember(cacheKey: string, result: OcrResult) {
    if (cacheSize <= 0) {
      return;
    }

    if (cache.has(cacheKey)) {
      cache.delete(cacheKey);
    }

    cache.set(cacheKey, cloneResult(result));
    while (cache.size > cacheSize) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  }

  async function getWorker(languages: string[]) {
    const languagesKey = languages.join("+");
    if (worker && workerLanguagesKey === languagesKey) {
      return worker;
    }

    if (worker) {
      await worker.terminate().catch(() => undefined);
      worker = undefined;
      workerLanguagesKey = "";
    }

    const tesseract = await import("tesseract.js") as TesseractModule;
    const createWorker = getTesseractCreateWorker(tesseract);
    const localTrainedDataPath = findLocalTrainedDataPath(languages, trainedDataPath);
    worker = localTrainedDataPath
      ? await createWorker(languages, localOcrEngineMode, { langPath: localTrainedDataPath, gzip: false })
      : await createWorker(languages);
    workerLanguagesKey = languagesKey;
    return worker;
  }

  function enqueue<T>(task: () => Promise<T>) {
    const result = queue.then(task, task);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    async recognize(image, options) {
      if (image.length === 0) {
        return { text: "", confidence: 0 };
      }

      if (options.mode === "model") {
        throw new Error("Model OCR is not implemented yet");
      }

      const languages = normalizeLanguages(options.languages);
      const cacheKey = createCacheKey(image, languages);
      const cached = cache.get(cacheKey);
      if (cached) {
        return cloneResult(cached);
      }

      return enqueue(async () => {
        const queuedCached = cache.get(cacheKey);
        if (queuedCached) {
          return cloneResult(queuedCached);
        }

        const currentWorker = await getWorker(languages);
        const preparedImage = await preprocessImage(image);
        const result = await currentWorker.recognize(preparedImage);
        const ocrResult: OcrResult = {
          text: (result.data.text ?? "").trim(),
          confidence: readConfidence(result.data.confidence),
          lines: readOcrLines(result.data),
        };
        remember(cacheKey, ocrResult);
        return cloneResult(ocrResult);
      });
    },
  };
}
