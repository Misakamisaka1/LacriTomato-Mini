import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelService } from "../../src/main/services/modelService";

const providerConfig = {
  baseURL: "https://api.deepseek.com",
  apiKey: "test-key",
  model: "deepseek-v4-flash",
  temperature: 0.2,
  timeoutMs: 60000,
};

describe("model service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests DeepSeek chat completions as strict JSON translations", async () => {
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
      providerConfig,
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(fetchMock).toHaveBeenCalledWith("https://api.deepseek.com/v1/chat/completions", expect.any(Object));
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(result.results).toEqual([
      { language: "en", text: "Hello" },
      { language: "ja", text: "こんにちは" },
    ]);
  });

  it("maps provider language-name translation keys back to requested target codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                detectedLanguage: "en",
                translations: { 中文: "修改后，右键宠物菜单不显示。" },
              }),
            },
          },
        ],
      }),
    });
    const service = createModelService({ fetch: fetchMock });

    const result = await service.translate(
      {
        sourceText: "After you modified it, the right-click pet menu is not showing.",
        sourceLanguage: "en",
        targetLanguages: ["zh-CN"],
        style: "accurate",
      },
      providerConfig,
    );

    expect(result.results).toEqual([
      { language: "zh-CN", text: "修改后，右键宠物菜单不显示。" },
    ]);
  });
  it("requests pet chat completions with the conversation history", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "我在这里，今天也一起努力。",
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
    });
    const service = createModelService({ fetch: fetchMock });

    const result = await service.chat({
      messages: [{ role: "user", content: "今天有点累" }],
    }, providerConfig);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1]).toEqual({ role: "user", content: "今天有点累" });
    expect(result.message).toEqual({ role: "assistant", content: "我在这里，今天也一起努力。" });
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8 });
  });

  it("includes pet personality, custom prompt, and memory in chat system context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "记住啦。" } }],
      }),
    });
    const service = createModelService({ fetch: fetchMock });

    await service.chat({
      messages: [{ role: "user", content: "我叫番茄" }],
      systemContext: {
        personalityPrompt: "保持温暖陪伴。",
        behaviorPrompt: "回复通常不超过三句话。",
        customPrompt: "用户喜欢直截了当。",
        memorySummary: "用户常在晚上写代码。",
      },
    }, providerConfig);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    const systemContent = body.messages[0].content as string;

    expect(systemContent).toContain("你是 LacriTomato Mini 桌面宠物");
    expect(systemContent).toContain("保持温暖陪伴。");
    expect(systemContent).toContain("回复通常不超过三句话。");
    expect(systemContent).toContain("用户喜欢直截了当。");
    expect(systemContent).toContain("用户常在晚上写代码。");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "我叫番茄" });
  });
  it("tests the model connection with a minimal chat completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    });
    const service = createModelService({ fetch: fetchMock });

    await expect(service.testConnection(providerConfig)).resolves.toEqual({
      ok: true,
      message: "连接成功",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.max_tokens).toBe(8);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "ping" });
  });
  it("refuses translation before an API key is saved", async () => {
    const fetchMock = vi.fn();
    const service = createModelService({ fetch: fetchMock });

    await expect(service.translate(
      {
        sourceText: "你好",
        sourceLanguage: "auto",
        targetLanguages: ["en"],
        style: "accurate",
      },
      { ...providerConfig, apiKey: "" },
    )).rejects.toThrow("请先在设置页保存 DeepSeek API Key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses chat before an API key is saved", async () => {
    const fetchMock = vi.fn();
    const service = createModelService({ fetch: fetchMock });

    await expect(service.chat(
      { messages: [{ role: "user", content: "你好" }] },
      { ...providerConfig, apiKey: "" },
    )).rejects.toThrow("请先在设置页保存 DeepSeek API Key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes the provider error message when DeepSeek rejects a request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: {
          message: "Model `deepseek-flash` does not exist.",
        },
      }),
    });
    const service = createModelService({ fetch: fetchMock });

    await expect(service.translate(
      {
        sourceText: "你好",
        sourceLanguage: "auto",
        targetLanguages: ["en"],
        style: "accurate",
      },
      {
        ...providerConfig,
        model: "deepseek-flash",
      },
    )).rejects.toThrow("Model `deepseek-flash` does not exist.");
  });

  it("aborts provider requests when the configured timeout expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    }));
    const service = createModelService({ fetch: fetchMock as typeof fetch });

    const translation = service.translate(
      {
        sourceText: "你好",
        sourceLanguage: "auto",
        targetLanguages: ["en"],
        style: "accurate",
      },
      { ...providerConfig, timeoutMs: 25 },
    );

    const timeoutExpectation = expect(translation).rejects.toThrow("模型请求超时");

    await vi.advanceTimersByTimeAsync(25);
    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/chat/completions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

