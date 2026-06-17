import type { TranslateRequest, TranslateResult } from "../../plugins/translator/types.js";

export interface ModelProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface ModelService {
  translate(request: TranslateRequest, config: ModelProviderConfig): Promise<TranslateResult>;
}

export function createModelService(options: { fetch: typeof fetch }): ModelService {
  return {
    async translate(request, config) {
      const response = await options.fetch(`${config.baseURL.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          messages: [
            {
              role: "system",
              content: "You are a translation engine. Return strict JSON only.",
            },
            {
              role: "user",
              content: [
                `Source language: ${request.sourceLanguage}`,
                `Target languages: ${request.targetLanguages.join(", ")}`,
                `Style: ${request.style}`,
                "Return JSON shape: {\"detectedLanguage\":\"...\",\"translations\":{\"en\":\"...\"}}",
                `Text:\n${request.sourceText}`,
              ].join("\n"),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Model request failed with HTTP ${response.status}`);
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content) as {
        detectedLanguage?: string;
        translations?: Record<string, string>;
      };

      return {
        detectedLanguage: parsed.detectedLanguage,
        results: request.targetLanguages.map((language) => ({
          language,
          text: parsed.translations?.[language] ?? "",
        })),
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
        },
        raw: content,
      };
    },
  };
}
