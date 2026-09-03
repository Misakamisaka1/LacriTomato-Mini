import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOcrService } from "../../src/main/services/ocrService";

const tesseract = vi.hoisted(() => ({
  createWorker: vi.fn(),
}));

vi.mock("tesseract.js", () => ({
  default: {
    createWorker: tesseract.createWorker,
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createWorkerMock(text = "识别文本", confidence = 91) {
  return {
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: `  ${text}\n`,
        confidence,
      },
    }),
    terminate: vi.fn().mockResolvedValue({ data: undefined, jobId: "terminate" }),
  };
}

function expectLocalWorkerCreate(languages: string[], call = 1) {
  expect(tesseract.createWorker).toHaveBeenNthCalledWith(call, languages, 1, expect.objectContaining({
    gzip: false,
    langPath: expect.any(String),
  }));
}

describe("ocr service", () => {
  beforeEach(() => {
    tesseract.createWorker.mockReset();
  });

  it("returns empty text for empty image input", async () => {
    const service = createOcrService();
    await expect(service.recognize(Buffer.alloc(0), { mode: "local", languages: ["eng"] })).resolves.toEqual({
      text: "",
      confidence: 0,
    });
  });

  it("recognizes non-empty images through a reusable local tesseract worker", async () => {
    const service = createOcrService();
    const image = Buffer.from([1, 2, 3]);
    const worker = createWorkerMock();
    tesseract.createWorker.mockResolvedValueOnce(worker);

    await expect(service.recognize(image, { mode: "local", languages: ["chi_sim", "eng"] })).resolves.toEqual({
      text: "识别文本",
      confidence: 91,
    });
    expectLocalWorkerCreate(["chi_sim", "eng"]);
    expect(worker.recognize).toHaveBeenCalledWith(image);
  });

  it("maps tesseract line boxes into the OCR result", async () => {
    const service = createOcrService();
    const image = Buffer.from([1, 2, 3]);
    const worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: "第一行\n第二行",
          confidence: 90,
          lines: [
            { text: "第一行", confidence: 95, bbox: { x0: 10, y0: 20, x1: 210, y1: 50 } },
            { text: "第二行", confidence: 84, bbox: { x0: 12, y0: 55, x1: 208, y1: 85 } },
          ],
        },
      }),
      terminate: vi.fn().mockResolvedValue({ data: undefined, jobId: "terminate" }),
    };
    tesseract.createWorker.mockResolvedValueOnce(worker);

    await expect(service.recognize(image, { mode: "local", languages: ["chi_sim", "eng"] })).resolves.toEqual({
      text: "第一行\n第二行",
      confidence: 90,
      lines: [
        { text: "第一行", confidence: 95, bbox: { x: 10, y: 20, width: 200, height: 30 } },
        { text: "第二行", confidence: 84, bbox: { x: 12, y: 55, width: 196, height: 30 } },
      ],
    });
  });

  it("omits line boxes when the recognizer does not provide them", async () => {
    const service = createOcrService();
    const worker = createWorkerMock();
    tesseract.createWorker.mockResolvedValueOnce(worker);

    const result = await service.recognize(Buffer.from([1]), { mode: "local", languages: ["eng"] });
    expect(result.lines).toBeUndefined();
  });

  it("reuses the worker for repeated recognitions with the same languages", async () => {
    const service = createOcrService();
    const worker = createWorkerMock();
    tesseract.createWorker.mockResolvedValueOnce(worker);

    await service.recognize(Buffer.from([1]), { mode: "local", languages: ["chi_sim", "eng"] });
    await service.recognize(Buffer.from([2]), { mode: "local", languages: ["eng", "chi_sim"] });

    expect(tesseract.createWorker).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenCalledTimes(2);
  });

  it("terminates and recreates the worker when languages change", async () => {
    const service = createOcrService();
    const firstWorker = createWorkerMock("中文");
    const secondWorker = createWorkerMock("English");
    tesseract.createWorker
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);

    await service.recognize(Buffer.from([1]), { mode: "local", languages: ["chi_sim", "eng"] });
    await service.recognize(Buffer.from([2]), { mode: "local", languages: ["eng"] });

    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expectLocalWorkerCreate(["eng"], 2);
    expect(secondWorker.recognize).toHaveBeenCalledTimes(1);
  });

  it("returns a cached result for the same image and languages", async () => {
    const service = createOcrService();
    const worker = createWorkerMock();
    tesseract.createWorker.mockResolvedValueOnce(worker);
    const image = Buffer.from([1, 2, 3]);

    const first = await service.recognize(image, { mode: "local", languages: ["eng"] });
    const second = await service.recognize(Buffer.from([1, 2, 3]), { mode: "local", languages: ["eng"] });

    expect(second).toEqual(first);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent recognition requests through one worker", async () => {
    const service = createOcrService();
    const firstRecognition = createDeferred<{ data: { text: string; confidence: number } }>();
    const worker = {
      recognize: vi.fn()
        .mockReturnValueOnce(firstRecognition.promise)
        .mockResolvedValueOnce({ data: { text: "second", confidence: 88 } }),
      terminate: vi.fn().mockResolvedValue({ data: undefined, jobId: "terminate" }),
    };
    tesseract.createWorker.mockResolvedValueOnce(worker);

    const first = service.recognize(Buffer.from([1]), { mode: "local", languages: ["eng"] });
    const second = service.recognize(Buffer.from([2]), { mode: "local", languages: ["eng"] });

    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledTimes(1));

    firstRecognition.resolve({ data: { text: "first", confidence: 90 } });
    await expect(first).resolves.toEqual({ text: "first", confidence: 90 });
    await expect(second).resolves.toEqual({ text: "second", confidence: 88 });
    expect(worker.recognize).toHaveBeenCalledTimes(2);
  });

  it("preprocesses cache misses before recognition", async () => {
    const sourceImage = Buffer.from([1, 2, 3]);
    const preprocessedImage = Buffer.from([9, 8, 7]);
    const preprocessImage = vi.fn(() => preprocessedImage);
    const service = createOcrService({ preprocessImage });
    const worker = createWorkerMock();
    tesseract.createWorker.mockResolvedValueOnce(worker);

    await service.recognize(sourceImage, { mode: "local", languages: ["eng"] });
    await service.recognize(Buffer.from([1, 2, 3]), { mode: "local", languages: ["eng"] });

    expect(preprocessImage).toHaveBeenCalledTimes(1);
    expect(preprocessImage).toHaveBeenCalledWith(sourceImage);
    expect(worker.recognize).toHaveBeenCalledWith(preprocessedImage);
  });

  it("keeps model OCR disabled until a remote image policy is implemented", async () => {
    const service = createOcrService();

    await expect(service.recognize(Buffer.from([1]), { mode: "model", languages: ["eng"] }))
      .rejects.toThrow("Model OCR is not implemented yet");
    expect(tesseract.createWorker).not.toHaveBeenCalled();
  });
});
