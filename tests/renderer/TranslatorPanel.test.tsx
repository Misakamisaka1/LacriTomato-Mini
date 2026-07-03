import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPanel } from "../../src/plugins/translator/renderer/TranslatorPanel";
import { defaultAppConfig } from "../../src/shared/configSchema";

const closeWindow = vi.fn();
const getConfig = vi.fn();
const writeClipboardText = vi.fn();
const historyStorageKey = "lacritomato.translator.history";

function setTranslatorSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

describe("TranslatorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setTranslatorSearch("");
    getConfig.mockResolvedValue(defaultAppConfig);
    writeClipboardText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeClipboardText },
    });
    window.petdex = {
      config: {
        get: getConfig,
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
        translate: vi.fn().mockResolvedValue({
          results: [{ language: "en", text: "Hello" }],
        }),
        chat: vi.fn(),
        testConnection: vi.fn(),
      },
      windowControls: {
        close: closeWindow,
      },
    };
  });

  it("translates pasted text", async () => {
    render(<TranslatorPanel />);
    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(await screen.findByText("Hello")).toBeTruthy();
  });

  it("stores successful translations in local history", async () => {
    render(<TranslatorPanel />);

    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));

    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(await screen.findByText("历史记录")).toBeTruthy();
    expect(screen.getByRole("button", { name: "你好" })).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(historyStorageKey) ?? "[]") as Array<{ sourceText: string }>;
    expect(stored[0]?.sourceText).toBe("你好");
  });

  it("disables translation history when the configured limit is zero", async () => {
    getConfig.mockResolvedValue({
      ...defaultAppConfig,
      translator: { ...defaultAppConfig.translator, historyLimit: 0 },
    });

    render(<TranslatorPanel />);
    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));

    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(screen.queryByText("历史记录")).toBeNull();
    expect(localStorage.getItem(historyStorageKey)).toBeNull();
  });

  it("prefills and auto-translates text from the quick translate query", async () => {
    setTranslatorSearch("?view=translator&text=%E4%BD%A0%E5%A5%BD&autoTranslate=1");
    const translate = vi.mocked(window.petdex!.model.translate);

    render(<TranslatorPanel />);

    expect((screen.getByLabelText("输入文本") as HTMLTextAreaElement).value).toBe("你好");
    await waitFor(() => expect(translate).toHaveBeenCalledWith(expect.objectContaining({
      sourceText: "你好",
      sourceLanguage: "auto",
    })));
    expect(await screen.findByText("Hello")).toBeTruthy();
  });

  it("renders target languages as selectable chips", async () => {
    render(<TranslatorPanel />);

    expect((await screen.findByLabelText("英文")).closest(".translator-target")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("中文").closest(".translator-target")?.className).toContain("is-selected"));
  });

  it("keeps translation controls in a dedicated work area beside history", async () => {
    render(<TranslatorPanel />);

    expect(await screen.findByLabelText("翻译工作区")).toBeTruthy();
    const layout = screen.getByLabelText("翻译布局");
    expect(layout.contains(screen.getByLabelText("翻译工作区"))).toBe(true);
    expect(layout.contains(screen.getByLabelText("翻译历史"))).toBe(true);
  });

  it("offers expanded language choices", async () => {
    render(<TranslatorPanel />);

    expect(await screen.findByLabelText("繁体中文")).toBeTruthy();
    expect(screen.getByLabelText("意大利文")).toBeTruthy();
    expect(screen.getByLabelText("葡萄牙文")).toBeTruthy();
    expect(screen.getByLabelText("俄文")).toBeTruthy();
    expect(screen.getByLabelText("阿拉伯文")).toBeTruthy();
    expect(screen.getByLabelText("越南文")).toBeTruthy();
    expect(screen.getByLabelText("泰文")).toBeTruthy();
    expect(screen.getByLabelText("印尼文")).toBeTruthy();
  });

  it("lets each translation result be copied, used as input, or continued", async () => {
    const translate = vi.mocked(window.petdex!.model.translate);
    translate
      .mockResolvedValueOnce({ results: [{ language: "en", text: "Hello" }] })
      .mockResolvedValueOnce({ results: [{ language: "zh-CN", text: "你好" }] });

    render(<TranslatorPanel />);
    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));

    expect(await screen.findByText("Hello")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "复制英文结果" }));
    expect(writeClipboardText).toHaveBeenCalledWith("Hello");

    fireEvent.click(screen.getByRole("button", { name: "用英文结果替换输入" }));
    expect((screen.getByLabelText("输入文本") as HTMLTextAreaElement).value).toBe("Hello");

    fireEvent.click(screen.getByRole("button", { name: "继续翻译英文结果" }));
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(2));
    expect(translate).toHaveBeenLastCalledWith(expect.objectContaining({ sourceText: "Hello", sourceLanguage: "en" }));
  });

  it("clears the source text with a dedicated action", async () => {
    render(<TranslatorPanel />);
    await waitFor(() => expect(screen.getByLabelText("中文").closest(".translator-target")?.className).toContain("is-selected"));
    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "需要清空" } });

    fireEvent.click(screen.getByRole("button", { name: "清空输入" }));

    expect((screen.getByLabelText("输入文本") as HTMLTextAreaElement).value).toBe("");
  });

  it("groups multi-language results in a dedicated results region", async () => {
    const translate = vi.mocked(window.petdex!.model.translate);
    translate.mockResolvedValueOnce({
      results: [
        { language: "en", text: "Prepare the environment" },
        { language: "ja", text: "環境を準備する" },
      ],
    });

    render(<TranslatorPanel />);
    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "准备环境" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));

    const results = await screen.findByLabelText("翻译结果");
    expect(results.textContent).toContain("Prepare the environment");
    expect(results.textContent).toContain("環境を準備する");
  });

  it("closes the translator window from its title bar", async () => {
    render(<TranslatorPanel />);
    await waitFor(() => expect(screen.getByLabelText("中文").closest(".translator-target")?.className).toContain("is-selected"));

    fireEvent.click(screen.getByRole("button", { name: "关闭翻译" }));

    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});
