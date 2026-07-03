import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { chatPersonalityTemplates } from "../../plugins/chat/templates";
import type { AppConfig } from "../../shared/configSchema";
import { defaultAppConfig } from "../../shared/configSchema";
import type { PluginContributions, PluginShortcutContribution } from "../../shared/pluginTypes";
import { captureShortcutAccelerator } from "../../shared/shortcutAccelerator";
import "./SettingsApp.css";

type SettingsSection = "model" | "shortcuts" | "translator" | "screenshot" | "ocr" | "pet" | "plugins" | "chat" | "recording";
type ShortcutKey = keyof AppConfig["shortcuts"];
type BooleanSection = Extract<SettingsSection, "screenshot" | "recording" | "ocr" | "pet" | "plugins">;

const disconnectedMessage = "桌宠服务未连接，请重新启动应用。";

const coreSections: { id: SettingsSection; label: string }[] = [
  { id: "model", label: "模型" },
  { id: "shortcuts", label: "快捷键" },
  { id: "pet", label: "桌宠" },
  { id: "plugins", label: "插件" },
];

const fallbackShortcutFields: { key: ShortcutKey; label: string }[] = [
  { key: "captureArea", label: "截图快捷键" },
  { key: "openTranslator", label: "打开翻译快捷键" },
  { key: "quickTranslateSelection", label: "快速翻译选中文本" },
  { key: "togglePet", label: "显示隐藏宠物快捷键" },
  { key: "toggleRecording", label: "录屏快捷键" },
];

const settingsRouteToSection: Record<string, SettingsSection> = {
  "translator-settings": "translator",
  "screenshot-settings": "screenshot",
  "ocr-settings": "ocr",
  "chat-settings": "chat",
  "recording-settings": "recording",
};

const customChatPromptTemplateId = "custom";
const chatPromptTemplateOptions = [
  ...chatPersonalityTemplates,
  {
    id: customChatPromptTemplateId,
    label: "自定义",
    description: "完全由用户填写提示词。",
    prompt: "",
  },
];

function isChatPromptTemplateId(id: string) {
  return chatPromptTemplateOptions.some((template) => template.id === id);
}

function getSelectedChatPromptTemplateId(chat: AppConfig["chat"]) {
  if (chat.personalityId === customChatPromptTemplateId || chat.promptTemplateId === customChatPromptTemplateId) {
    return customChatPromptTemplateId;
  }

  if (isChatPromptTemplateId(chat.personalityId)) {
    return chat.personalityId;
  }

  if (isChatPromptTemplateId(chat.promptTemplateId)) {
    return chat.promptTemplateId;
  }

  return defaultAppConfig.chat.personalityId;
}

function findChatPromptTemplateOption(id: string) {
  return chatPromptTemplateOptions.find((template) => template.id === id) ?? chatPromptTemplateOptions[0];
}

function withVisibleChatPrompt(config: AppConfig): AppConfig {
  const templateId = getSelectedChatPromptTemplateId(config.chat);
  if (templateId === customChatPromptTemplateId || config.chat.customPrompt.trim()) {
    return {
      ...config,
      chat: {
        ...config.chat,
        personalityId: templateId,
        promptTemplateId: templateId,
      },
    };
  }

  return {
    ...config,
    chat: {
      ...config.chat,
      personalityId: templateId,
      promptTemplateId: templateId,
      customPrompt: findChatPromptTemplateOption(templateId).prompt,
    },
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function makeShortcutLabel(shortcut: PluginShortcutContribution) {
  return shortcut.label.endsWith("快捷键") ? shortcut.label : `${shortcut.label}快捷键`;
}

function buildShortcutFields(contributions?: PluginContributions) {
  const contributedById = new Map((contributions?.shortcuts ?? []).map((shortcut) => [shortcut.id, shortcut]));
  return fallbackShortcutFields.map((field) => {
    const contribution = contributedById.get(field.key);
    return contribution ? { key: field.key, label: makeShortcutLabel(contribution) } : field;
  });
}

function buildSections(contributions?: PluginContributions) {
  const sections = [...coreSections];
  const known = new Set(sections.map((section) => section.id));

  for (const section of contributions?.settingsSections ?? []) {
    const mappedId = settingsRouteToSection[section.rendererRoute];
    if (!mappedId || known.has(mappedId)) {
      continue;
    }

    const insertAt = mappedId === "translator" ? 2 : sections.length - 2;
    sections.splice(Math.max(0, insertAt), 0, { id: mappedId, label: section.label });
    known.add(mappedId);
  }

  return sections;
}

type SaveDirectorySection = "screenshot" | "recording";

function getSaveDirectoryDisplay(config: AppConfig, section: SaveDirectorySection) {
  return config[section].saveDirectoryPath || config[section].saveDirectoryName;
}

interface ShortcutInputProps {
  label: string;
  value: string;
  onChange(value: string): void;
  onMessage(message: string): void;
}

function ShortcutInput({ label, value, onChange, onMessage }: ShortcutInputProps) {
  const [recording, setRecording] = useState(false);

  function startRecording() {
    setRecording(true);
    onMessage("按下 2-3 键组合，Esc 取消");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setRecording(false);
      event.currentTarget.blur();
      onMessage("已取消快捷键录制");
      return;
    }

    const result = captureShortcutAccelerator({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    });

    if (result.status === "pending" || result.status === "invalid") {
      onMessage(result.message);
      return;
    }

    onChange(result.accelerator);
    setRecording(false);
    event.currentTarget.blur();
    onMessage(`已设置 ${label}: ${result.accelerator}`);
  }

  return (
    <label className="settings-shortcut-field">
      {label}
      <input
        className={`settings-shortcut-input${recording ? " is-recording" : ""}`}
        aria-label={label}
        readOnly
        value={recording ? "请按下 2-3 键组合" : value}
        onFocus={startRecording}
        onClick={startRecording}
        onBlur={() => setRecording(false)}
        onKeyDown={handleKeyDown}
      />
      <span className="settings-field-note">点击输入框后直接按组合键，支持 2-3 个按键。</span>
    </label>
  );
}

export function SettingsApp() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("model");
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig);
  const [contributions, setContributions] = useState<PluginContributions | undefined>();
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyStorageSecure, setApiKeyStorageSecure] = useState(true);
  const [chatMemory, setChatMemory] = useState("");
  const [recordingAudioDevices, setRecordingAudioDevices] = useState<Array<{ id: string; name: string; default?: boolean }>>([]);
  const [notice, setNotice] = useState("");
  const [connectionBusy, setConnectionBusy] = useState(false);

  async function showSettingsTip(message: string) {
    const nextMessage = message.trim();
    if (!nextMessage) {
      return;
    }

    const api = window.petdex;
    if (api?.screenshot?.showTip) {
      setNotice("");
      try {
        await api.screenshot.showTip(nextMessage);
        return;
      } catch (error) {
        setNotice(getErrorMessage(error, nextMessage));
        return;
      }
    }

    setNotice(nextMessage);
  }

  const sections = useMemo(() => buildSections(contributions), [contributions]);
  const shortcutFields = useMemo(() => buildShortcutFields(contributions), [contributions]);

  useEffect(() => {
    const api = window.petdex;
    if (!api) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    void Promise.all([
      api.config.get(),
      api.config.getApiKeyStatus?.().catch(() => undefined),
      api.plugins.listContributions().catch(() => undefined),
      api.chat?.getMemory().catch(() => undefined),
      api.recording?.listAudioDevices().catch(() => []),
    ])
      .then(([nextConfig, apiKeyStatus, nextContributions, nextMemory, nextRecordingDevices]) => {
        const status = apiKeyStatus ?? { saved: false, secure: true };
        setConfig(withVisibleChatPrompt(nextConfig));
        setApiKeySaved(status.saved);
        setApiKeyStorageSecure(status.secure);
        setContributions(nextContributions);
        setChatMemory(nextMemory?.summary ?? "");
        setRecordingAudioDevices(nextRecordingDevices ?? []);
      })
      .catch((error) => {
        void showSettingsTip(getErrorMessage(error, "读取设置失败"));
      });
  }, []);

  function updateSection<K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) {
    setConfig((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...patch,
      },
    }));
  }

  function updateBoolean(section: BooleanSection, key: string, value: boolean) {
    updateSection(section, { [key]: value } as Partial<AppConfig[typeof section]>);
  }

  function updateSaveDirectoryInput(section: SaveDirectorySection, value: string) {
    if (section === "screenshot") {
      updateSection("screenshot", config.screenshot.saveDirectoryPath ? { saveDirectoryPath: value } : { saveDirectoryName: value });
      return;
    }

    updateSection("recording", config.recording.saveDirectoryPath ? { saveDirectoryPath: value } : { saveDirectoryName: value });
  }

  async function chooseSaveDirectory(section: SaveDirectorySection) {
    const api = window.petdex;
    if (!api?.dialog) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    try {
      const selectedPath = await api.dialog.selectDirectory(config[section].saveDirectoryPath || undefined);
      if (!selectedPath) {
        return;
      }

      if (section === "screenshot") {
        updateSection("screenshot", { saveDirectoryPath: selectedPath });
      } else {
        updateSection("recording", { saveDirectoryPath: selectedPath });
      }
    } catch (error) {
      void showSettingsTip(getErrorMessage(error, "选择文件夹失败"));
    }
  }

  async function saveConfig() {
    const api = window.petdex;
    if (!api) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    try {
      const selectedChatTemplateId = getSelectedChatPromptTemplateId(config.chat);
      if (selectedChatTemplateId === customChatPromptTemplateId && !config.chat.customPrompt.trim()) {
        void showSettingsTip("请先输入自定义提示词");
        return;
      }

      const configToSave = withVisibleChatPrompt(config);
      const nextConfig = await api.config.set(configToSave);
      const trimmedApiKey = apiKey.trim();
      setConfig(withVisibleChatPrompt(nextConfig));

      if (trimmedApiKey) {
        await api.config.setApiKey(trimmedApiKey);
        setApiKey("");
        setApiKeySaved(true);
        const status = await api.config.getApiKeyStatus?.().catch(() => undefined);
        setApiKeyStorageSecure(status?.secure ?? true);
        void showSettingsTip("设置已保存，API Key 已更新");
        return;
      }

      void showSettingsTip("设置已保存，快捷键已重新注册");
    } catch (error) {
      void showSettingsTip(getErrorMessage(error, "保存设置失败"));
    }
  }

  async function testModelConnection() {
    const api = window.petdex;
    if (!api) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    setConnectionBusy(true);
    void showSettingsTip("正在测试连接...");
    try {
      const result = await api.model.testConnection();
      void showSettingsTip(result.message);
    } catch (error) {
      void showSettingsTip(getErrorMessage(error, "连接失败"));
    } finally {
      setConnectionBusy(false);
    }
  }

  async function saveChatMemory() {
    const api = window.petdex;
    if (!api?.chat) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    try {
      const memory = await api.chat.setMemory(chatMemory);
      setChatMemory(memory.summary);
      void showSettingsTip("宠物记忆已保存");
    } catch (error) {
      void showSettingsTip(getErrorMessage(error, "保存宠物记忆失败"));
    }
  }

  async function clearChatMemory() {
    const api = window.petdex;
    if (!api?.chat) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    try {
      const memory = await api.chat.clearMemory();
      setChatMemory(memory.summary);
      void showSettingsTip("宠物记忆已清空");
    } catch (error) {
      void showSettingsTip(getErrorMessage(error, "清空宠物记忆失败"));
    }
  }

  async function clearChatHistory() {
    const api = window.petdex;
    if (!api?.chat) {
      void showSettingsTip(disconnectedMessage);
      return;
    }

    try {
      await api.chat.clearHistory();
      void showSettingsTip("聊天记录已清除");
    } catch (error) {
      void showSettingsTip(getErrorMessage(error, "清除聊天记录失败"));
    }
  }

  return (
    <main className="settings-root">
      <aside className="settings-sidebar" aria-label="设置分类">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={activeSection === section.id}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </aside>
      <section className="settings-content">
        {notice && <p className="settings-notice" role="status">{notice}</p>}
        {activeSection === "model" && (
          <section className="settings-panel" aria-labelledby="settings-model-heading">
            <h1 id="settings-model-heading">模型</h1>
            <label>
              Base URL
              <input
                value={config.model.baseURL}
                onChange={(event) => updateSection("model", { baseURL: event.target.value })}
              />
            </label>
            <label>
              Model
              <input
                value={config.model.model}
                onChange={(event) => updateSection("model", { model: event.target.value })}
              />
            </label>
            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={config.model.temperature}
                onChange={(event) => updateSection("model", { temperature: Number(event.target.value) })}
              />
            </label>
            <label>
              Timeout(ms)
              <input
                type="number"
                min="1000"
                value={config.model.timeoutMs}
                onChange={(event) => updateSection("model", { timeoutMs: Number(event.target.value) })}
              />
            </label>
            <label>
              API Key
              <input
                value={apiKey}
                type="password"
                placeholder={apiKeySaved ? "已保存，可输入新 Key 覆盖" : "请输入 API Key"}
                aria-describedby="settings-api-key-status"
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <p id="settings-api-key-status" className="settings-field-note">
              {apiKeySaved
                ? apiKeyStorageSecure
                  ? "API Key 已保存，可输入新 Key 覆盖。"
                  : "API Key 已保存，但当前环境使用本机弱加密存储。"
                : "尚未保存 API Key。"}
            </p>
            <button type="button" className="settings-secondary" disabled={connectionBusy} onClick={() => void testModelConnection()}>
              测试连接
            </button>
          </section>
        )}
        {activeSection === "shortcuts" && (
          <section className="settings-panel" aria-labelledby="settings-shortcuts-heading">
            <h1 id="settings-shortcuts-heading">快捷键</h1>
            {shortcutFields.map((field) => (
              <ShortcutInput
                key={field.key}
                label={field.label}
                value={config.shortcuts[field.key]}
                onChange={(value) => updateSection("shortcuts", { [field.key]: value } as Partial<AppConfig["shortcuts"]>)}
                onMessage={(message) => void showSettingsTip(message)}
              />
            ))}
          </section>
        )}
        {activeSection === "translator" && (
          <section className="settings-panel" aria-labelledby="settings-translator-heading">
            <h1 id="settings-translator-heading">翻译</h1>
            <label>
              默认源语言
              <input
                value={config.translator.defaultSourceLanguage}
                onChange={(event) => updateSection("translator", { defaultSourceLanguage: event.target.value })}
              />
            </label>
            <label>
              默认目标语言
              <input
                value={config.translator.defaultTargetLanguages.join(",")}
                onChange={(event) => updateSection("translator", {
                  defaultTargetLanguages: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                })}
              />
            </label>
            <label>
              翻译历史条数
              <input
                type="number"
                min="0"
                max="100"
                aria-label="翻译历史条数"
                value={config.translator.historyLimit}
                onChange={(event) => updateSection("translator", { historyLimit: Number(event.target.value) })}
              />
            </label>
            <p className="settings-field-note">设为 0 可关闭翻译历史。</p>
          </section>
        )}
        {activeSection === "screenshot" && (
          <section className="settings-panel" aria-labelledby="settings-screenshot-heading">
            <h1 id="settings-screenshot-heading">截图</h1>
            <div className="settings-path-row">
              <label>
                截图保存目录
                <input
                  value={getSaveDirectoryDisplay(config, "screenshot")}
                  onChange={(event) => updateSaveDirectoryInput("screenshot", event.target.value)}
                />
              </label>
              <button type="button" className="settings-secondary" onClick={() => void chooseSaveDirectory("screenshot")}>
                选择截图文件夹
              </button>
            </div>
            <label>
              文件名模板
              <input
                value={config.screenshot.filenamePattern}
                onChange={(event) => updateSection("screenshot", { filenamePattern: event.target.value })}
              />
            </label>
            <label>
              复制格式
              <select
                value={config.screenshot.copyFormat}
                onChange={(event) => updateSection("screenshot", { copyFormat: event.target.value as AppConfig["screenshot"]["copyFormat"] })}
              >
                <option value="png">PNG 图片</option>
              </select>
            </label>
            <label>
              默认标注颜色
              <input
                type="color"
                value={config.screenshot.defaultAnnotationColor}
                onChange={(event) => updateSection("screenshot", { defaultAnnotationColor: event.target.value })}
              />
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.screenshot.hidePetWhenCapturing}
                onChange={(event) => updateBoolean("screenshot", "hidePetWhenCapturing", event.target.checked)}
              />
              截图时隐藏宠物
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.screenshot.enableScrollingCaptureExperiment}
                onChange={(event) => updateBoolean("screenshot", "enableScrollingCaptureExperiment", event.target.checked)}
              />
              启用滚动截图实验
            </label>
          </section>
        )}
        {activeSection === "ocr" && (
          <section className="settings-panel" aria-labelledby="settings-ocr-heading">
            <h1 id="settings-ocr-heading">OCR</h1>
            <label>
              OCR 模式
              <select
                value={config.ocr.mode}
                onChange={(event) => updateSection("ocr", { mode: event.target.value as AppConfig["ocr"]["mode"] })}
              >
                <option value="local">本地识别</option>
                <option value="model">模型识别</option>
              </select>
            </label>
            <label>
              OCR 语言
              <input
                value={config.ocr.languages.join(",")}
                onChange={(event) => updateSection("ocr", {
                  languages: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                })}
              />
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.ocr.sendToTranslatorAfterRecognize}
                onChange={(event) => updateBoolean("ocr", "sendToTranslatorAfterRecognize", event.target.checked)}
              />
              OCR 后发送到翻译
            </label>
          </section>
        )}
        {activeSection === "pet" && (
          <section className="settings-panel" aria-labelledby="settings-pet-heading">
            <h1 id="settings-pet-heading">桌宠</h1>
            <label>
              宠物高度
              <input
                type="number"
                min="96"
                max="480"
                value={config.pet.defaultHeight}
                onChange={(event) => updateSection("pet", { defaultHeight: Number(event.target.value) })}
              />
            </label>
            <label>
              透明度
              <input
                type="number"
                min="0.3"
                max="1"
                step="0.05"
                value={config.pet.opacity}
                onChange={(event) => updateSection("pet", { opacity: Number(event.target.value) })}
              />
            </label>
            <label>
              动画速度
              <input
                type="number"
                min="0.5"
                max="2"
                step="0.1"
                value={config.pet.animationSpeed}
                onChange={(event) => updateSection("pet", { animationSpeed: Number(event.target.value) })}
              />
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.pet.alwaysOnTop}
                onChange={(event) => updateBoolean("pet", "alwaysOnTop", event.target.checked)}
              />
              始终置顶
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.pet.wanderEnabled}
                onChange={(event) => updateBoolean("pet", "wanderEnabled", event.target.checked)}
              />
              自动游走
            </label>
          </section>
        )}
        {activeSection === "chat" && (
          <section className="settings-page settings-page--chat" aria-label="聊天设置">
            <header className="settings-page-header">
              <div>
                <h1 id="settings-chat-heading">聊天</h1>
              </div>
            </header>
            <div className="settings-grid settings-grid--two">
              <section className="settings-card" role="group" aria-label="性格与提示词">
                <div className="settings-card-header">
                  <h2>性格与提示词</h2>
                </div>
                <label>
                  提示词模板
                  <select
                    value={getSelectedChatPromptTemplateId(config.chat)}
                    onChange={(event) => {
                      const template = findChatPromptTemplateOption(event.target.value);
                      updateSection("chat", {
                        personalityId: template.id,
                        promptTemplateId: template.id,
                        customPrompt: template.prompt,
                      });
                    }}
                  >
                    {chatPromptTemplateOptions.map((template) => (
                      <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  提示词内容
                  <textarea
                    value={config.chat.customPrompt}
                    rows={7}
                    placeholder="输入要用于宠物聊天的提示词"
                    onChange={(event) => updateSection("chat", { customPrompt: event.target.value })}
                  />
                </label>
                <label>
                  聊天历史条数
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={config.chat.historyLimit}
                    onChange={(event) => updateSection("chat", { historyLimit: Number(event.target.value) })}
                  />
                </label>
              </section>
              <section className="settings-card" role="group" aria-label="记忆">
                <div className="settings-card-header">
                  <h2>记忆</h2>
                </div>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={config.chat.memoryEnabled}
                    onChange={(event) => updateSection("chat", { memoryEnabled: event.target.checked })}
                  />
                  启用宠物记忆
                </label>
                <label>
                  宠物记忆
                  <textarea
                    value={chatMemory}
                    rows={8}
                    onChange={(event) => setChatMemory(event.target.value)}
                  />
                </label>
                <div className="settings-action-row">
                  <button type="button" className="settings-secondary" onClick={() => void saveChatMemory()}>保存记忆</button>
                  <button type="button" className="settings-secondary settings-danger" onClick={() => void clearChatMemory()}>清空记忆</button>
                  <button type="button" className="settings-secondary settings-danger" onClick={() => void clearChatHistory()}>清除聊天记录</button>
                </div>
              </section>
              <section className="settings-card settings-card--wide" role="group" aria-label="主动话题">
                <div className="settings-card-header">
                  <h2>主动话题</h2>
                </div>
                <div className="settings-inline-grid">
                  <label className="settings-checkbox settings-inline-toggle">
                    <input
                      type="checkbox"
                      checked={config.chat.proactiveTopicsEnabled}
                      onChange={(event) => updateSection("chat", { proactiveTopicsEnabled: event.target.checked })}
                    />
                    主动提出话题
                  </label>
                  <label>
                    最小间隔(分钟)
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={config.chat.proactiveTopicMinMinutes}
                      onChange={(event) => updateSection("chat", { proactiveTopicMinMinutes: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    最大间隔(分钟)
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={config.chat.proactiveTopicMaxMinutes}
                      onChange={(event) => updateSection("chat", { proactiveTopicMaxMinutes: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </section>
            </div>
          </section>
        )}
        {activeSection === "recording" && (
          <section className="settings-panel" aria-labelledby="settings-recording-heading">
            <h1 id="settings-recording-heading">录屏</h1>
            <label>
              清晰度
              <select
                aria-label="清晰度"
                value={config.recording.qualityPreset}
                onChange={(event) => updateSection("recording", { qualityPreset: event.target.value as AppConfig["recording"]["qualityPreset"] })}
              >
                <option value="original">原始</option>
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
              </select>
            </label>
            <label>
              FPS
              <select
                aria-label="FPS"
                value={config.recording.frameRate}
                onChange={(event) => updateSection("recording", { frameRate: Number(event.target.value) as AppConfig["recording"]["frameRate"] })}
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </label>
            <label>
              视频码率
              <input
                type="number"
                min="500"
                max="100000"
                aria-label="视频码率"
                value={config.recording.videoBitrateKbps}
                onChange={(event) => updateSection("recording", { videoBitrateKbps: Number(event.target.value) })}
              />
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.recording.recordSystemAudio}
                onChange={(event) => updateBoolean("recording", "recordSystemAudio", event.target.checked)}
              />
              录制系统声音
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.recording.recordMicrophone}
                onChange={(event) => updateBoolean("recording", "recordMicrophone", event.target.checked)}
              />
              录制麦克风
            </label>
            <label>
              麦克风设备
              <select
                aria-label="麦克风设备"
                disabled={!config.recording.recordMicrophone}
                value={config.recording.microphoneDeviceName}
                onChange={(event) => updateSection("recording", { microphoneDeviceName: event.target.value })}
              >
                <option value="">默认麦克风</option>
                {recordingAudioDevices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name}</option>
                ))}
              </select>
            </label>
            <label>
              音频模式
              <select
                aria-label="音频模式"
                value={config.recording.audioMode}
                onChange={(event) => updateSection("recording", { audioMode: event.target.value as AppConfig["recording"]["audioMode"] })}
              >
                <option value="mixed">混合单轨</option>
                <option value="separate">分离双轨</option>
              </select>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.recording.captureCursor}
                onChange={(event) => updateBoolean("recording", "captureCursor", event.target.checked)}
              />
              录制鼠标
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={config.recording.hidePetWhenRecording}
                onChange={(event) => updateBoolean("recording", "hidePetWhenRecording", event.target.checked)}
              />
              录制时隐藏宠物
            </label>
            <div className="settings-path-row">
              <label>
                录屏保存目录
                <input
                  value={getSaveDirectoryDisplay(config, "recording")}
                  onChange={(event) => updateSaveDirectoryInput("recording", event.target.value)}
                />
              </label>
              <button type="button" className="settings-secondary" onClick={() => void chooseSaveDirectory("recording")}>
                选择录屏文件夹
              </button>
            </div>
            <label>
              录屏文件名模板
              <input
                value={config.recording.filenamePattern}
                onChange={(event) => updateSection("recording", { filenamePattern: event.target.value })}
              />
            </label>
          </section>
        )}        {activeSection === "plugins" && (
          <section className="settings-panel" aria-labelledby="settings-plugins-heading">
            <h1 id="settings-plugins-heading">插件</h1>
            {(contributions?.plugins ?? [
              { id: "translator", name: "翻译", capabilities: [] },
              { id: "screenshot", name: "截图", capabilities: [] },
              { id: "chat", name: "聊天", capabilities: [] },
              { id: "recording", name: "录屏", capabilities: [] },
            ]).map((plugin) => {
              const pluginId = plugin.id as keyof AppConfig["plugins"];
              return (
                <div className="settings-plugin-row" key={plugin.id}>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={config.plugins[pluginId] ?? true}
                      onChange={(event) => updateSection("plugins", { [plugin.id]: event.target.checked })}
                    />
                    {plugin.name}插件
                  </label>
                  {plugin.capabilities.length > 0 && (
                    <div className="settings-plugin-capabilities" aria-label={`${plugin.name}能力`}>
                      {plugin.capabilities.map((capability) => (
                        <span key={capability}>{capability}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
        <div className="settings-save-row">
          <button type="button" className="settings-save" onClick={saveConfig}>保存</button>
        </div>
      </section>
    </main>
  );
}





