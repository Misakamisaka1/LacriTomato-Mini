import { describe, expect, it, vi } from "vitest";
import { generateProactiveTopic } from "../../src/main/services/proactiveTopicGenerator";
import { defaultAppConfig } from "../../src/shared/configSchema";

describe("proactive topic generator", () => {
  it("generates proactive pet speech through the model with prompt and memory context", async () => {
    const modelService = {
      translate: vi.fn(),
      testConnection: vi.fn(),
      chat: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "刚刚想到你可能在忙，要不要聊一小会儿？" },
      }),
    };

    const topic = await generateProactiveTopic({
      modelService,
      providerConfig: {
        baseURL: "https://api.deepseek.com",
        apiKey: "key",
        model: "deepseek-v4-flash",
        temperature: 0.2,
        timeoutMs: 60000,
      },
      appConfig: {
        ...defaultAppConfig,
        chat: {
          ...defaultAppConfig.chat,
          personalityId: "playful-tomato",
          promptTemplateId: "playful-tomato",
          customPrompt: "你是一只活泼但不打扰人的番茄宠物。",
          memoryEnabled: true,
        },
      },
      memorySummary: "用户喜欢短回复。",
      now: () => 42,
    });

    expect(modelService.chat).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({
        role: "user",
        content: expect.stringContaining("主动发起"),
      })],
      systemContext: expect.objectContaining({
        behaviorPrompt: "你是一只活泼但不打扰人的番茄宠物。",
        memorySummary: "用户喜欢短回复。",
      }),
    }), expect.objectContaining({ apiKey: "key" }));
    expect(topic).toEqual({
      id: "model-42",
      text: "刚刚想到你可能在忙，要不要聊一小会儿？",
      draft: "想回复：刚刚想到你可能在忙，要不要聊一小会儿？",
    });
  });
  it("uses recent chat history and a livelier generation temperature to avoid repetitive proactive topics", async () => {
    const modelService = {
      translate: vi.fn(),
      testConnection: vi.fn(),
      chat: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "要不要给今晚留一个小目标？" },
      }),
    };

    await generateProactiveTopic({
      modelService,
      providerConfig: {
        baseURL: "https://api.deepseek.com",
        apiKey: "key",
        model: "deepseek-v4-flash",
        temperature: 0.2,
        timeoutMs: 60000,
      },
      appConfig: defaultAppConfig,
      memorySummary: "用户最近说自己在喝水。",
      recentHistory: [
        { role: "assistant", content: "爸爸，今天心情怎么样呀？" },
        { role: "assistant", content: "爸爸，今天心情怎么样呀？" },
        { role: "user", content: "你是谁" },
        { role: "assistant", content: "我是你的 LacriTomato 小番茄。" },
      ],
      now: () => 1000,
      random: () => 0.42,
    });

    const request = modelService.chat.mock.calls[0][0];
    const providerConfig = modelService.chat.mock.calls[0][1];
    expect(request.messages[0].content).toContain("最近已经说过/聊过的内容");
    expect(request.messages[0].content).toContain("爸爸，今天心情怎么样呀？");
    expect(request.messages[0].content).toContain("不要重复");
    expect(request.messages[0].content).toContain("变化种子：1000-420");
    expect(providerConfig.temperature).toBeGreaterThan(0.2);
  });
  it("retries once when the model repeats a recent proactive topic exactly", async () => {
    const modelService = {
      translate: vi.fn(),
      testConnection: vi.fn(),
      chat: vi.fn()
        .mockResolvedValueOnce({ message: { role: "assistant", content: "爸爸，今天心情怎么样呀？" } })
        .mockResolvedValueOnce({ message: { role: "assistant", content: "要不要给今天换个轻松目标？" } }),
    };

    const topic = await generateProactiveTopic({
      modelService,
      providerConfig: {
        baseURL: "https://api.deepseek.com",
        apiKey: "key",
        model: "deepseek-v4-flash",
        temperature: 0.2,
        timeoutMs: 60000,
      },
      appConfig: defaultAppConfig,
      memorySummary: "",
      recentHistory: [{ role: "assistant", content: "爸爸，今天心情怎么样呀？" }],
      now: () => 2000,
      random: () => 0.5,
    });

    expect(modelService.chat).toHaveBeenCalledTimes(2);
    expect(modelService.chat.mock.calls[1][0].messages[0].content).toContain("刚才生成的内容重复了");
    expect(topic.text).toBe("要不要给今天换个轻松目标？");
  });
});
