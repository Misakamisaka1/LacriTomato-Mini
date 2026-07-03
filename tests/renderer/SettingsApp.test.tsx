import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatPersonalityTemplates } from "../../src/plugins/chat/templates";
import { SettingsApp } from "../../src/renderer/shell/SettingsApp";
import { defaultAppConfig } from "../../src/shared/configSchema";

const hasApiKey = vi.fn();
const getApiKeyStatus = vi.fn();
const setApiKey = vi.fn();
const saveConfig = vi.fn();
const testConnection = vi.fn();
const listContributions = vi.fn();
const selectDirectory = vi.fn();
const getMemory = vi.fn();
const setMemory = vi.fn();
const clearMemory = vi.fn();
const clearHistory = vi.fn();
const showTip = vi.fn();

const pluginContributions = {
  menuItems: [],
  shortcuts: [
    { id: "openTranslator", label: "打开翻译", defaultAccelerator: "CommandOrControl+Shift+T" },
    { id: "quickTranslateSelection", label: "选中文字翻译", defaultAccelerator: "CommandOrControl+Shift+Y" },
    { id: "captureArea", label: "截图", defaultAccelerator: "CommandOrControl+Shift+A" },
    { id: "toggleRecording", label: "录屏", defaultAccelerator: "CommandOrControl+Shift+R" },
  ],
  settingsSections: [
    { id: "translator.settings", label: "翻译", rendererRoute: "translator-settings" },
    { id: "screenshot.settings", label: "截图", rendererRoute: "screenshot-settings" },
    { id: "ocr.settings", label: "OCR", rendererRoute: "ocr-settings" },
    { id: "chat.settings", label: "聊天", rendererRoute: "chat-settings" },
    { id: "recording.settings", label: "录屏", rendererRoute: "recording-settings" },
  ],
  panels: [],
  plugins: [
    { id: "translator", name: "翻译", version: "0.1.0", enabled: true, capabilities: ["model:text", "clipboard:text"] },
    { id: "screenshot", name: "截图", version: "0.1.0", enabled: true, capabilities: ["screen:capture", "clipboard:image", "file:save"] },
    { id: "chat", name: "聊天", version: "0.1.0", enabled: true, capabilities: ["model:text", "pet:behavior"] },
    { id: "recording", name: "录屏", version: "0.1.0", enabled: true, capabilities: ["screen:record", "audio:system-loopback", "audio:microphone", "file:save"] },
  ],
};

describe("SettingsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasApiKey.mockResolvedValue(false);
    getApiKeyStatus.mockResolvedValue({ saved: false, secure: true });
    saveConfig.mockImplementation(async (nextConfig) => nextConfig);
    setApiKey.mockResolvedValue(undefined);
    testConnection.mockResolvedValue({ ok: true, message: "连接成功" });
    listContributions.mockResolvedValue(pluginContributions);
    selectDirectory.mockResolvedValue(undefined);
    getMemory.mockResolvedValue({ summary: "用户喜欢短回复。", updatedAt: "2026-06-30T08:00:00.000Z" });
    setMemory.mockImplementation(async (summary: string) => ({ summary, updatedAt: "2026-06-30T08:00:01.000Z" }));
    clearMemory.mockResolvedValue({ summary: "", updatedAt: "2026-06-30T08:00:02.000Z" });
    clearHistory.mockResolvedValue([]);
    showTip.mockResolvedValue(undefined);
    window.petdex = {
      config: {
        get: vi.fn().mockResolvedValue(defaultAppConfig),
        set: saveConfig,
        setApiKey,
        hasApiKey,
        getApiKeyStatus,
        onChanged: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        listContributions,
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn(),
        chat: vi.fn(),
        testConnection,
      },
      chat: {
        listHistory: vi.fn(),
        clearHistory,
        getMemory,
        setMemory,
        clearMemory,
        send: vi.fn(),
        replyToProactiveTopic: vi.fn(),
      },
      recording: {
        getState: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        listAudioDevices: vi.fn().mockResolvedValue([{ id: "default", name: "默认麦克风", default: true }, { id: "usb", name: "USB Mic" }]),
        onStateChanged: vi.fn(),
      },
      screenshot: {
        showTip,
      } as never,
      windowControls: {
        close: vi.fn(),
      },
    };
    (window.petdex as NonNullable<typeof window.petdex> & {
      dialog: { selectDirectory: typeof selectDirectory };
    }).dialog = { selectDirectory };
  });

  it("shows model defaults first and shortcut defaults after switching sections", async () => {
    render(<SettingsApp />);
    expect(await screen.findByDisplayValue("deepseek-v4-flash")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "快捷键" }));

    expect(await screen.findByDisplayValue("CommandOrControl+Shift+A")).toBeTruthy();
    expect(screen.queryByLabelText("OCR 快捷键")).toBeNull();
  });

  it("uses plugin contributions for shortcut labels and translator settings", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "快捷键" }));
    expect(await screen.findByLabelText("打开翻译快捷键")).toBeTruthy();
    expect(screen.getByLabelText("选中文字翻译快捷键")).toBeTruthy();
    expect(screen.getByLabelText("录屏快捷键")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(screen.getByRole("heading", { name: "翻译" })).toBeTruthy();
    expect(screen.getByLabelText("翻译历史条数")).toBeTruthy();
  });

  it("tests the saved model connection without exposing the API key", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "测试连接" }));

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("连接成功"));
    expect(screen.queryByText("连接成功")).toBeNull();
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sk-/)).toBeNull();
  });

  it("captures custom shortcut input from pressed keys", async () => {
    render(<SettingsApp />);
    fireEvent.click(await screen.findByRole("button", { name: "快捷键" }));

    const shortcutInput = await screen.findByLabelText("打开翻译快捷键");
    fireEvent.click(shortcutInput);
    fireEvent.keyDown(shortcutInput, { key: "L", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect((shortcutInput as HTMLInputElement).value).toBe("CommandOrControl+Shift+L");
    await waitFor(() => expect(showTip).toHaveBeenCalledWith("设置已保存，快捷键已重新注册"));
    expect(screen.queryByText("设置已保存，快捷键已重新注册")).toBeNull();
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      shortcuts: expect.objectContaining({
        openTranslator: "CommandOrControl+Shift+L",
      }),
    }));
  });

  it("rejects shortcut input with more than three keys", async () => {
    render(<SettingsApp />);
    fireEvent.click(await screen.findByRole("button", { name: "快捷键" }));

    const shortcutInput = await screen.findByLabelText("截图快捷键");
    fireEvent.click(shortcutInput);
    fireEvent.keyDown(shortcutInput, { key: "S", ctrlKey: true, altKey: true, shiftKey: true });

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("快捷键最多支持 3 个按键"));
    expect(screen.queryByRole("status")).toBeNull();
    expect((shortcutInput as HTMLInputElement).value).toBe("请按下 2-3 键组合");
  });

  it("switches sidebar sections instead of leaving the buttons inert", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "截图" }));

    expect(screen.getByRole("heading", { name: "截图" })).toBeTruthy();
    expect(screen.getByLabelText("文件名模板")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "桌宠" }));

    expect(screen.getByRole("heading", { name: "桌宠" })).toBeTruthy();
    expect(screen.getByLabelText("宠物高度")).toBeTruthy();
  });

  it("edits the chat prompt template, memory, and clears history", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "聊天" }));

    const warmPrompt = chatPersonalityTemplates.find((template) => template.id === "warm-companion")?.prompt ?? "";
    const focusPrompt = chatPersonalityTemplates.find((template) => template.id === "focus-coach")?.prompt ?? "";

    expect(await screen.findByRole("region", { name: "聊天设置" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "性格与提示词" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "记忆" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "主动话题" })).toBeTruthy();
    expect(screen.queryByLabelText("宠物性格")).toBeNull();
    expect(await screen.findByLabelText("提示词模板")).toBeTruthy();
    expect(screen.getByLabelText("提示词内容")).toBeTruthy();
    expect(screen.getByDisplayValue(warmPrompt)).toBeTruthy();
    expect(await screen.findByDisplayValue("用户喜欢短回复。")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("提示词模板"), { target: { value: "focus-coach" } });
    expect(screen.getByDisplayValue(focusPrompt)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("提示词内容"), { target: { value: "请回复短一点。" } });
    fireEvent.change(screen.getByLabelText("宠物记忆"), { target: { value: "用户晚上写代码。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存记忆" }));

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("宠物记忆已保存"));
    expect(setMemory).toHaveBeenCalledWith("用户晚上写代码。");

    fireEvent.click(screen.getByRole("button", { name: "清除聊天记录" }));
    await waitFor(() => expect(showTip).toHaveBeenCalledWith("聊天记录已清除"));
    expect(clearHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(showTip).toHaveBeenCalledWith("设置已保存，快捷键已重新注册"));
    expect(screen.queryByText("设置已保存，快捷键已重新注册")).toBeNull();
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      chat: expect.objectContaining({
        personalityId: "focus-coach",
        promptTemplateId: "focus-coach",
        customPrompt: "请回复短一点。",
      }),
    }));
  });

  it("requires custom chat prompt content before saving", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "聊天" }));
    fireEvent.change(await screen.findByLabelText("提示词模板"), { target: { value: "custom" } });

    const promptInput = screen.getByLabelText("提示词内容") as HTMLTextAreaElement;
    expect(promptInput.value).toBe("");

    saveConfig.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("请先输入自定义提示词"));
    expect(saveConfig).not.toHaveBeenCalled();

    fireEvent.change(promptInput, { target: { value: "只用一句话回复。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("设置已保存，快捷键已重新注册"));
    expect(screen.queryByText("设置已保存，快捷键已重新注册")).toBeNull();
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      chat: expect.objectContaining({
        personalityId: "custom",
        promptTemplateId: "custom",
        customPrompt: "只用一句话回复。",
      }),
    }));
  });
  it("edits recording settings and saves them", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "录屏" }));

    expect(await screen.findByRole("heading", { name: "录屏" })).toBeTruthy();
    expect(screen.getByLabelText("录屏保存目录")).toBeTruthy();
    expect((screen.getByLabelText("麦克风设备") as HTMLSelectElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("清晰度"), { target: { value: "720p" } });
    fireEvent.change(screen.getByLabelText("FPS"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("视频码率"), { target: { value: "12000" } });
    fireEvent.click(screen.getByLabelText("录制麦克风"));
    fireEvent.change(screen.getByLabelText("麦克风设备"), { target: { value: "usb" } });
    fireEvent.change(screen.getByLabelText("音频模式"), { target: { value: "separate" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("设置已保存，快捷键已重新注册"));
    expect(screen.queryByText("设置已保存，快捷键已重新注册")).toBeNull();
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      recording: expect.objectContaining({
        qualityPreset: "720p",
        frameRate: 60,
        videoBitrateKbps: 12000,
        recordMicrophone: true,
        microphoneDeviceName: "usb",
        audioMode: "separate",
      }),
    }));
  });
  it("selects custom screenshot and recording save folders", async () => {
    selectDirectory
      .mockResolvedValueOnce("D:/captures/screenshots")
      .mockResolvedValueOnce("D:/captures/recordings");
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "截图" }));
    fireEvent.click(screen.getByRole("button", { name: "选择截图文件夹" }));
    expect(await screen.findByDisplayValue("D:/captures/screenshots")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "录屏" }));
    fireEvent.click(screen.getByRole("button", { name: "选择录屏文件夹" }));
    expect(await screen.findByDisplayValue("D:/captures/recordings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(showTip).toHaveBeenCalledWith("设置已保存，快捷键已重新注册"));
    expect(screen.queryByText("设置已保存，快捷键已重新注册")).toBeNull();
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      screenshot: expect.objectContaining({
        saveDirectoryPath: "D:/captures/screenshots",
      }),
      recording: expect.objectContaining({
        saveDirectoryPath: "D:/captures/recordings",
      }),
    }));
  });

  it("shows plugin toggles with their declared capabilities", async () => {
    render(<SettingsApp />);

    fireEvent.click(await screen.findByRole("button", { name: "插件" }));

    expect(screen.getByLabelText("聊天插件")).toBeTruthy();
    expect(screen.getAllByText("model:text")).toHaveLength(2);
    expect(screen.getByText("pet:behavior")).toBeTruthy();
  });

  it("shows a saved API key state without echoing the secret", async () => {
    hasApiKey.mockResolvedValue(true);
    getApiKeyStatus.mockResolvedValue({ saved: true, secure: true });

    render(<SettingsApp />);

    expect(await screen.findByText("API Key 已保存，可输入新 Key 覆盖。")).toBeTruthy();
    expect(screen.getByLabelText("API Key").getAttribute("placeholder")).toBe("已保存，可输入新 Key 覆盖");
  });

  it("warns when API keys are stored with weak local storage", async () => {
    hasApiKey.mockResolvedValue(true);
    getApiKeyStatus.mockResolvedValue({ saved: true, secure: false });

    render(<SettingsApp />);

    expect(await screen.findByText("API Key 已保存，但当前环境使用本机弱加密存储。")).toBeTruthy();
  });

  it("keeps the API key saved state visible after saving a replacement key", async () => {
    render(<SettingsApp />);

    const keyInput = await screen.findByLabelText("API Key");
    fireEvent.change(keyInput, { target: { value: "sk-new" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(showTip).toHaveBeenCalledWith("设置已保存，API Key 已更新"));
    expect(setApiKey).toHaveBeenCalledWith("sk-new");
    expect((keyInput as HTMLInputElement).value).toBe("");
    expect(screen.getByText("API Key 已保存，可输入新 Key 覆盖。")).toBeTruthy();
  });

  it("shows a connection notice instead of a blank page when preload API is missing", () => {
    delete window.petdex;

    render(<SettingsApp />);

    expect(screen.getByRole("status").textContent).toContain("桌宠服务未连接");
  });
});




