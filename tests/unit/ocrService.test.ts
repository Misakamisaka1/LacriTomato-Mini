import { describe, expect, it } from "vitest";
import { createOcrService } from "../../src/main/services/ocrService";

describe("ocr service", () => {
  it("returns empty text for empty image input", async () => {
    const service = createOcrService();
    await expect(service.recognize(Buffer.alloc(0), { mode: "local", languages: ["eng"] })).resolves.toEqual({
      text: "",
      confidence: 0,
    });
  });
});
