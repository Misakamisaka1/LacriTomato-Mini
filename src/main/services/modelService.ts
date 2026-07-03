import type { ChatRequest, ChatResult } from "../../plugins/chat/types.js";
import type { TranslateRequest, TranslateResult } from "../../plugins/translator/types.js";

export interface ModelProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface ModelConnectionResult {
  ok: boolean;
  message: string;
}

export interface ModelService {
  translate(request: TranslateRequest, config: ModelProviderConfig): Promise<TranslateResult>;
  chat(request: ChatRequest, config: ModelProviderConfig): Promise<ChatResult>;
  testConnection(config: ModelProviderConfig): Promise<ModelConnectionResult>;
}

async function readProviderError(response: Response): Promise<string> {
  const fallback = `Model request failed with HTTP ${response.status}`;
  const text = await response.text().catch(() => "");

  if (!text.trim()) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string };
      message?: string;
    };
    return payload.error?.message ?? payload.message ?? text.trim();
  } catch {
    return text.trim();
  }
}

function ensureApiKey(config: ModelProviderConfig) {
  if (!config.apiKey.trim()) {
    throw new Error("请先在设置页保存 DeepSeek API Key。");
  }
}

function completionsUrl(config: ModelProviderConfig) {
  return `${config.baseURL.replace(/\/$/, "")}/v1/chat/completions`;
}

const translationKeyAliases: Record<string, string[]> = {
  "zh-CN": ["zh", "zh-cn", "zh_hans", "zh-hans", "中文", "简体中文", "汉语", "chinese", "simplified chinese"],
  "zh-TW": ["zh-tw", "zh_hant", "zh-hant", "繁体中文", "繁體中文", "traditional chinese"],
  en: ["english", "英文", "英语", "英語"],
  ja: ["jp", "japanese", "日文", "日语", "日語", "日本語"],
  ko: ["kr", "korean", "韩文", "韩语", "韓文", "韓語", "한국어"],
  fr: ["french", "法文", "法语", "法語"],
  de: ["german", "德文", "德语", "德語"],
  es: ["spanish", "西班牙文", "西班牙语", "西班牙語"],
  it: ["italian", "意大利文", "意大利语", "意大利語"],
  pt: ["portuguese", "葡萄牙文", "葡萄牙语", "葡萄牙語"],
  ru: ["russian", "俄文", "俄语", "俄語"],
  ar: ["arabic", "阿拉伯文", "阿拉伯语", "阿拉伯語"],
  vi: ["vietnamese", "越南文", "越南语", "越南語"],
  th: ["thai", "泰文", "泰语", "泰語"],
  id: ["indonesian", "印尼文", "印尼语", "印尼語"],
};

function normalizeTranslationKey(key: string) {
  return key.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function readTranslatedText(translations: Record<string, string> | undefined, language: string, targetCount: number) {
  if (!translations) {
    return "";
  }

  const entries = Object.entries(translations).filter(([, value]) => typeof value === "string" && value.trim().length > 0);
  const candidates = new Set([language, ...(translationKeyAliases[language] ?? [])].map(normalizeTranslationKey));
  const matched = entries.find(([key]) => candidates.has(normalizeTranslationKey(key)));

  if (matched) {
    return matched[1];
  }

  if (targetCount === 1 && entries.length === 1) {
    return entries[0][1];
  }

  return "";
}

function buildPetChatSystemPrompt(request: ChatRequest) {
  const context = request.systemContext;
  return [
    "你是 LacriTomato Mini 桌面宠物。",
    "回复要自然、简短、有陪伴感，可以轻微活泼，但不要装作现实中能看到用户屏幕。",
    "如果用户需要执行软件功能，引导他们使用桌宠菜单或设置页。",
    context?.personalityPrompt,
    context?.behaviorPrompt,
    context?.customPrompt,
    context?.memorySummary ? `长期记忆：\n${context.memorySummary}` : undefined,
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0).join("\n");
}
async function postChatCompletion(
  fetchImpl: typeof fetch,
  config: ModelProviderConfig,
  body: Record<string, unknown>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(completionsUrl(config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readProviderError(response));
    }

    return response.json() as Promise<{
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("模型请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createModelService(options: { fetch: typeof fetch }): ModelService {
  return {
    async translate(request, config) {
      ensureApiKey(config);

      const payload = await postChatCompletion(options.fetch, config, {
        model: config.model,
        temperature: config.temperature,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
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
              "Use the requested target language codes exactly as keys in translations; do not use language names.",
              `Text:\n${request.sourceText}`,
            ].join("\n"),
          },
        ],
      });

      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content) as {
        detectedLanguage?: string;
        translations?: Record<string, string>;
      };

      return {
        detectedLanguage: parsed.detectedLanguage,
        results: request.targetLanguages.map((language) => ({
          language,
          text: readTranslatedText(parsed.translations, language, request.targetLanguages.length),
        })),
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
        },
        raw: content,
      };
    },

    async chat(request, config) {
      ensureApiKey(config);

      const payload = await postChatCompletion(options.fetch, config, {
        model: config.model,
        temperature: config.temperature,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: buildPetChatSystemPrompt(request),
          },
          ...request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      });

      const content = payload.choices?.[0]?.message?.content?.trim() ?? "";

      return {
        message: { role: "assistant", content },
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
        },
        raw: content,
      };
    },

    async testConnection(config) {
      ensureApiKey(config);

      await postChatCompletion(options.fetch, config, {
        model: config.model,
        temperature: 0,
        thinking: { type: "disabled" },
        max_tokens: 8,
        messages: [
          { role: "system", content: "Reply with ok." },
          { role: "user", content: "ping" },
        ],
      });

      return { ok: true, message: "连接成功" };
    },
  };
}

