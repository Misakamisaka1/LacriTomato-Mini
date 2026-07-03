import { describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload?: unknown) => unknown>();

  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(),
    },
    screen: {
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } })),
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  ipcMain: electronMock.ipcMain,
  screen: electronMock.screen,
}));

function createDeps() {
  const chatStateService = {
    listHistory: vi.fn(() => [{ id: "h1", role: "assistant", content: "我记得。", createdAt: "2026-06-30T08:00:00.000Z" }]),
    appendMessages: vi.fn(() => [
      { id: "h1", role: "assistant", content: "我记得。", createdAt: "2026-06-30T08:00:00.000Z" },
      { id: "h2", role: "user", content: "我叫番茄", createdAt: "2026-06-30T08:00:01.000Z" },
      { id: "h3", role: "assistant", content: "记住啦。", createdAt: "2026-06-30T08:00:02.000Z" },
    ]),
    clearHistory: vi.fn(() => []),
    getMemory: vi.fn(() => ({ summary: "用户喜欢短回复。", updatedAt: "2026-06-30T08:00:00.000Z" })),
    setMemory: vi.fn((summary: string) => ({ summary, updatedAt: "2026-06-30T08:00:03.000Z" })),
    clearMemory: vi.fn(() => ({ summary: "", updatedAt: "2026-06-30T08:00:04.000Z" })),
    updateMemoryFromUserMessage: vi.fn(() => ({ summary: "用户喜欢短回复。\n我叫番茄", updatedAt: "2026-06-30T08:00:05.000Z" })),
  };
  const modelService = {
    translate: vi.fn(),
    testConnection: vi.fn(),
    chat: vi.fn().mockResolvedValue({ message: { role: "assistant", content: "记住啦。" } }),
  };

  return {
    chatStateService,
    modelService,
    configService: {
      getConfig: vi.fn(() => defaultAppConfig),
      setConfig: vi.fn(),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] })),
    },
    invokePluginAction: vi.fn(),
    getModelProviderConfig: vi.fn(() => ({
      baseURL: "https://api.deepseek.com",
      apiKey: "key",
      model: "deepseek-v4-flash",
      temperature: 0.2,
      timeoutMs: 60000,
    })),
    replyToProactiveTopic: vi.fn(),
  };
}

describe("chat IPC", () => {
  it("registers chat history, memory, send, and proactive reply channels", () => {
    registerCoreIpc(createDeps() as never);

    expect(ipcChannels.chatHistoryList).toBe("chat:history:list");
    expect(ipcChannels.chatSend).toBe("chat:send");
    expect(electronMock.handlers.has(ipcChannels.chatHistoryList)).toBe(true);
    expect(electronMock.handlers.has(ipcChannels.chatHistoryClear)).toBe(true);
    expect(electronMock.handlers.has(ipcChannels.chatMemoryGet)).toBe(true);
    expect(electronMock.handlers.has(ipcChannels.chatMemorySet)).toBe(true);
    expect(electronMock.handlers.has(ipcChannels.chatMemoryClear)).toBe(true);
    expect(electronMock.handlers.has(ipcChannels.chatSend)).toBe(true);
    expect(electronMock.handlers.has(ipcChannels.chatProactiveTopicReply)).toBe(true);
  });

  it("sends chat through the model with history, personality prompt, effective prompt, and memory", async () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    const send = electronMock.handlers.get(ipcChannels.chatSend);
    const result = await send?.({ sender: {} }, { content: " 我叫番茄 " });

    expect(deps.modelService.chat).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        { role: "assistant", content: "我记得。" },
        { role: "user", content: "我叫番茄" },
      ],
      systemContext: expect.objectContaining({
        personalityPrompt: expect.stringContaining("温暖"),
        behaviorPrompt: expect.stringContaining("日常陪伴"),
        memorySummary: "用户喜欢短回复。",
      }),
    }), expect.objectContaining({ apiKey: "key" }));
    expect(deps.chatStateService.appendMessages).toHaveBeenCalledWith([
      { role: "user", content: "我叫番茄" },
      { role: "assistant", content: "记住啦。" },
    ], 200);
    expect(result).toEqual(expect.objectContaining({
      message: { role: "assistant", content: "记住啦。" },
      memory: { summary: "用户喜欢短回复。\n我叫番茄", updatedAt: "2026-06-30T08:00:05.000Z" },
    }));
  });
  it("uses the saved single chat prompt without duplicating personality context", async () => {
    const deps = createDeps();
    deps.configService.getConfig.mockReturnValue({
      ...defaultAppConfig,
      chat: {
        ...defaultAppConfig.chat,
        personalityId: "focus-coach",
        promptTemplateId: "focus-coach",
        customPrompt: "只用一句话回复。",
      },
    });
    registerCoreIpc(deps as never);

    const send = electronMock.handlers.get(ipcChannels.chatSend);
    await send?.({ sender: {} }, { content: " 开始吧 " });

    const request = deps.modelService.chat.mock.calls[0][0];
    expect(request.systemContext).toEqual(expect.objectContaining({
      behaviorPrompt: "只用一句话回复。",
      memorySummary: "用户喜欢短回复。",
    }));
    expect(request.systemContext.personalityPrompt).toBeUndefined();
    expect(request.systemContext.customPrompt).toBeUndefined();
  });
});
