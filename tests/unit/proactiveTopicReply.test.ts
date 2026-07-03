import { describe, expect, it, vi } from "vitest";
import { createProactiveTopicReplyHandler } from "../../src/main/services/proactiveTopicReply";

describe("proactive topic reply", () => {
  it("opens chat without prefilling the composer when replying to a proactive topic", () => {
    const topics = new Map([
      ["topic-1", { id: "topic-1", text: "要聊聊今天吗？", draft: "我想回复这句话。" }],
    ]);
    const openChat = vi.fn();
    const replyToProactiveTopic = createProactiveTopicReplyHandler({ topics, openChat });

    replyToProactiveTopic("topic-1");

    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0]).toEqual([]);
    expect(topics.has("topic-1")).toBe(false);
  });
});