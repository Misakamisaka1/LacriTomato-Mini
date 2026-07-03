import { describe, expect, it, vi } from "vitest";
import { createProactiveTopicService } from "../../src/main/services/proactiveTopicService";
import { defaultAppConfig } from "../../src/shared/configSchema";

function configWithChat(chat: Partial<typeof defaultAppConfig.chat>) {
  return {
    ...defaultAppConfig,
    chat: {
      ...defaultAppConfig.chat,
      ...chat,
    },
  };
}

describe("proactive topic service", () => {
  it("schedules, records, and shows a model-generated topic at a random delay within the configured interval", async () => {
    let scheduled: { callback: () => Promise<void> | void; delayMs: number } | undefined;
    const showTopic = vi.fn();
    const recordTopic = vi.fn();
    const generateTopic = vi.fn().mockResolvedValue({
      id: "generated-1",
      text: "我刚想到一个问题，想听听你的想法。",
      draft: "我想聊聊你刚才提到的问题。",
    });
    const service = createProactiveTopicService({
      getConfig: () => configWithChat({ proactiveTopicsEnabled: true, proactiveTopicMinMinutes: 10, proactiveTopicMaxMinutes: 20 }),
      showTopic,
      recordTopic,
      generateTopic,
      random: () => 0.5,
      setTimer: (callback, delayMs) => {
        scheduled = { callback, delayMs };
        return 1;
      },
      clearTimer: vi.fn(),
      topics: [{ id: "focus", text: "要不要聊聊下一步？", draft: "想聊聊下一步。" }],
    });

    service.start();

    expect(scheduled?.delayMs).toBe(15 * 60 * 1000);

    await scheduled?.callback();

    const generatedTopic = {
      id: "generated-1",
      text: "我刚想到一个问题，想听听你的想法。",
      draft: "我想聊聊你刚才提到的问题。",
    };
    expect(generateTopic).toHaveBeenCalledTimes(1);
    expect(recordTopic).toHaveBeenCalledWith(generatedTopic);
    expect(showTopic).toHaveBeenCalledWith(generatedTopic);
  });

  it("records and shows a bundled topic when model generation fails", async () => {
    let scheduled: { callback: () => Promise<void> | void; delayMs: number } | undefined;
    const showTopic = vi.fn();
    const recordTopic = vi.fn();
    const service = createProactiveTopicService({
      getConfig: () => configWithChat({ proactiveTopicsEnabled: true, proactiveTopicMinMinutes: 10, proactiveTopicMaxMinutes: 10 }),
      showTopic,
      recordTopic,
      generateTopic: vi.fn().mockRejectedValue(new Error("no key")),
      random: () => 0,
      setTimer: (callback, delayMs) => {
        scheduled = { callback, delayMs };
        return 1;
      },
      clearTimer: vi.fn(),
      topics: [{ id: "focus", text: "要不要聊聊下一步？", draft: "想聊聊下一步。" }],
    });

    service.start();
    await scheduled?.callback();

    expect(recordTopic).toHaveBeenCalledWith({ id: "focus", text: "要不要聊聊下一步？", draft: "想聊聊下一步。" });
    expect(showTopic).toHaveBeenCalledWith({ id: "focus", text: "要不要聊聊下一步？", draft: "想聊聊下一步。" });
  });

  it("does not schedule proactive topics when disabled", () => {
    const setTimer = vi.fn();
    const service = createProactiveTopicService({
      getConfig: () => configWithChat({ proactiveTopicsEnabled: false }),
      showTopic: vi.fn(),
      setTimer,
      clearTimer: vi.fn(),
    });

    service.start();

    expect(setTimer).not.toHaveBeenCalled();
  });
});