export interface OcrOptions {
  mode: "local" | "model";
  languages: string[];
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrService {
  recognize(image: Buffer, options: OcrOptions): Promise<OcrResult>;
}

export function createOcrService(): OcrService {
  return {
    async recognize(image, options) {
      if (image.length === 0) {
        return { text: "", confidence: 0 };
      }

      if (options.mode === "model") {
        throw new Error("Model OCR is not implemented yet");
      }

      const tesseract = await import("tesseract.js");
      const result = await tesseract.recognize(image, options.languages.join("+") || "chi_sim+eng");
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence,
      };
    },
  };
}
