import { describe, expect, it, vi } from "vitest";
import { createModelService } from "../../src/main/services/modelService";

describe("model service", () => {
  it("requests OpenAI-compatible chat completions and parses JSON translations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                detectedLanguage: "zh-CN",
                translations: { en: "Hello", ja: "こんにちは" },
              }),
            },
          },
        ],
      }),
    });

    const service = createModelService({ fetch: fetchMock });
    const result = await service.translate(
      {
        sourceText: "你好",
        sourceLanguage: "auto",
        targetLanguages: ["en", "ja"],
        style: "accurate",
      },
      {
        baseURL: "https://api.deepseek.com",
        apiKey: "test-key",
        model: "deepseek-flash",
        temperature: 0.2,
        timeoutMs: 60000,
      },
    );

    expect(result.results).toEqual([
      { language: "en", text: "Hello" },
      { language: "ja", text: "こんにちは" },
    ]);
  });
});
