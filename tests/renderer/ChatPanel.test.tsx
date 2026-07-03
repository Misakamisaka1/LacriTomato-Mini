import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "../../src/plugins/chat/renderer/ChatPanel";

const closeWindow = vi.fn();
const listHistory = vi.fn();
const sendChat = vi.fn();

const persistedHistory = [
  { id: "h1", role: "assistant" as const, content: "之前我们聊过番茄。", createdAt: "2026-06-30T08:00:00.000Z" },
];

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listHistory.mockResolvedValue(persistedHistory);
    sendChat.mockResolvedValue({
      message: { role: "assistant", content: "我在这里。" },
      history: [
        ...persistedHistory,
        { id: "h2", role: "user", content: "你好", createdAt: "2026-06-30T08:00:01.000Z" },
        { id: "h3", role: "assistant", content: "我在这里。", createdAt: "2026-06-30T08:00:02.000Z" },
      ],
      memory: { summary: "" },
    });
    window.petdex = {
      config: {
        get: vi.fn(),
        set: vi.fn(),
        setApiKey: vi.fn(),
        hasApiKey: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        listContributions: vi.fn(),
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn(),
        testConnection: vi.fn(),
        chat: vi.fn(),
      },
      chat: {
        listHistory,
        clearHistory: vi.fn(),
        getMemory: vi.fn(),
        setMemory: vi.fn(),
        clearMemory: vi.fn(),
        send: sendChat,
        replyToProactiveTopic: vi.fn(),
      },
      windowControls: {
        close: closeWindow,
      },
    };
  });

  it("loads persisted chat history on open", async () => {
    render(<ChatPanel />);

    expect(await screen.findByText("之前我们聊过番茄。")).toBeTruthy();
    expect(listHistory).toHaveBeenCalledTimes(1);
  });

  it("sends a message through the chat API and renders the persisted reply", async () => {
    render(<ChatPanel />);

    fireEvent.change(await screen.findByLabelText("输入聊天内容"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("你好")).toBeTruthy();
    expect(await screen.findByText("我在这里。")).toBeTruthy();
    expect(sendChat).toHaveBeenCalledWith({ content: "你好" });
    expect(window.petdex!.model.chat).not.toHaveBeenCalled();
  });

  it("scrolls to the newest message on open and after new chat messages arrive", async () => {
    let messageScrollHeight = 420;
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.getAttribute("aria-label") === "聊天记录" ? messageScrollHeight : 0;
      },
    });

    try {
      render(<ChatPanel />);

      const messageList = await screen.findByLabelText("聊天记录");
      await screen.findByText("之前我们聊过番茄。");
      await waitFor(() => expect(messageList.scrollTop).toBe(420));

      messageScrollHeight = 840;
      fireEvent.change(screen.getByLabelText("输入聊天内容"), { target: { value: "你好" } });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));

      await screen.findByText("我在这里。");
      await waitFor(() => expect(messageList.scrollTop).toBe(840));
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalDescriptor);
      } else {
        delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
      }
    }
  });
  it("closes the chat window from the title bar", async () => {
    render(<ChatPanel />);
    await screen.findByText("之前我们聊过番茄。");

    fireEvent.click(screen.getByRole("button", { name: "关闭聊天" }));

    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});

