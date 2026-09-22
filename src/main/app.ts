import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, Tray, nativeImage, safeStorage, shell } from "electron";
import type { ChatProactiveTopic } from "../plugins/chat/types.js";
import type { AppConfig } from "../shared/configSchema.js";
import { ipcChannels } from "../shared/ipcChannels.js";
import type { PetEmotion } from "../shared/petBehavior.js";
import { chatManifest } from "../plugins/chat/manifest.js";
import { screenshotManifest } from "../plugins/screenshot/manifest.js";
import { recordingManifest } from "../plugins/recording/manifest.js";
import { translatorManifest } from "../plugins/translator/manifest.js";
import { registerCoreIpc } from "./ipc/registerCoreIpc.js";
import { registerAppShortcuts } from "./services/appShortcuts.js";
import { createChatStateService } from "./services/chatStateService.js";
import { createConfigService } from "./services/configService.js";
import { createPetPositionService } from "./services/petPositionService.js";
import { createPetVitalsService } from "./services/petVitalsService.js";
import { createModelService } from "./services/modelService.js";
import { createPluginRegistry } from "./services/pluginRegistry.js";
import { createProactiveTopicService } from "./services/proactiveTopicService.js";
import { generateProactiveTopic } from "./services/proactiveTopicGenerator.js";
import { createProactiveTopicReplyHandler } from "./services/proactiveTopicReply.js";
import { createOcrService } from "./services/ocrService.js";
import { createOcrImagePreprocessor } from "./services/ocrImagePreprocessor.js";
import { startAreaCaptureWithHiddenPet } from "./services/petHiddenCapture.js";
import { createPetSkinService, readSpritesheetImageSize } from "./services/petSkinService.js";
import { createScreenshotService } from "./services/screenshotService.js";
import { createRecordingService } from "./services/recordingService.js";
import { createSecretService } from "./services/secretService.js";
import { createSelectedTextService } from "./services/selectedTextService.js";
import { createShortcutService } from "./services/shortcutService.js";
import { createPetWindow } from "./windows/createPetWindow.js";
import { createSettingsWindow } from "./windows/createSettingsWindow.js";
import { createPinnedImageWindow } from "./windows/createPinnedImageWindow.js";
import { createScreenshotTipWindow } from "./windows/createScreenshotTipWindow.js";
import { createRecordingControlWindow, toggleRecordingControlWindow } from "./windows/createRecordingControlWindow.js";
import { createTranslatorPanel } from "./windows/createTranslatorPanel.js";
import { createChatPanel } from "./windows/createChatPanel.js";
import { createAppResourcePaths } from "./appPaths.js";

let tray: Tray | undefined;

function createTrayIcon(iconPath: string) {
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    throw new Error(`Failed to load tray icon from path '${iconPath}'`);
  }

  return icon;
}

async function main() {
  await app.whenReady();

  const appPaths = createAppResourcePaths(app.getAppPath());
  const preloadPath = appPaths.preloadPath;
  const rendererIndexPath = appPaths.rendererIndexPath;
  const userDataPath = app.getPath("userData");
  const configService = createConfigService({ userDataPath });
  const petSkinService = createPetSkinService({
    getConfig: () => configService.getConfig(),
    bundledManifestPath: appPaths.bundledPetManifestPath,
    bundledSpritesheetPath: appPaths.bundledPetSpritesheetPath,
    readImageSize: readSpritesheetImageSize,
    makeFileUrl(path) {
      return pathToFileURL(path).toString();
    },
    openExternal(url) {
      return shell.openExternal(url);
    },
    petdexLibraryPath: join(userDataPath, "petdex-skins"),
    async fetchJson(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Petdex 请求失败 (${response.status})`);
      }
      return response.json();
    },
    async fetchBinary(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Petdex 下载失败 (${response.status})`);
      }
      return Buffer.from(await response.arrayBuffer());
    },
  });
  const chatStateService = createChatStateService({ userDataPath });
  const secretService = createSecretService({ userDataPath, safeStorage });
  const modelService = createModelService({ fetch });
  const pluginRegistry = createPluginRegistry([translatorManifest, screenshotManifest, chatManifest, recordingManifest], configService.getConfig().plugins);
  const screenshotService = createScreenshotService({ userDataPath, rendererIndexPath });
  const recordingService = createRecordingService({
    userDataPath,
    ffmpegPath: appPaths.ffmpegPath,
    wasapiLoopbackHelperPath: appPaths.wasapiLoopbackHelperPath,
  });
  const selectedTextService = createSelectedTextService();
  const ocrService = createOcrService({
    trainedDataPath: appPaths.trainedDataPath,
    preprocessImage: createOcrImagePreprocessor(nativeImage),
  });
  const shortcutService = createShortcutService();
  const petPositionService = createPetPositionService({ userDataPath });
  const petVitalsService = createPetVitalsService({
    userDataPath,
    getConfig: () => configService.getConfig(),
  });
  const petWindow = createPetWindow(preloadPath, configService.getConfig().pet, rendererIndexPath);
  const savedPetAnchor = petPositionService.load();
  if (savedPetAnchor) {
    const initialBounds = petWindow.getBounds();
    petWindow.setBounds({
      x: Math.round(savedPetAnchor.x - initialBounds.width / 2),
      y: Math.round(savedPetAnchor.y - initialBounds.height),
      width: initialBounds.width,
      height: initialBounds.height,
    });
  }
  const proactiveTopics = new Map<string, ChatProactiveTopic>();
  let petHiddenForRecording = false;
  const recordingControlWindowState: { current?: BrowserWindow } = {};

  function showPetEmotion(emotion: PetEmotion, bubbleText?: string, durationMs?: number) {
    petWindow.webContents.send(ipcChannels.petEmotion, { emotion, bubbleText, durationMs });
  }

  function showPetBubble(message: string, emotion: PetEmotion = "happy") {
    petWindow.webContents.send(ipcChannels.petBubble, message);
    showPetEmotion(emotion, message);
  }

  function openTranslator(initialText?: string, autoTranslate = false) {
    createTranslatorPanel(preloadPath, { initialText, autoTranslate }, rendererIndexPath);
  }

  function openChat(initialDraft?: string) {
    createChatPanel(preloadPath, { initialDraft }, rendererIndexPath);
  }

  function showProactiveTopic(topic: ChatProactiveTopic) {
    proactiveTopics.set(topic.id, topic);
    petWindow.webContents.send(ipcChannels.petBubble, {
      text: topic.text,
      emotion: "attentive",
      actionLabel: "回复",
      action: { type: "chat.replyToTopic", topicId: topic.id },
      durationMs: 12000,
    });
  }

  const proactiveTopicService = createProactiveTopicService({
    getConfig: () => configService.getConfig(),
    showTopic: showProactiveTopic,
    recordTopic: (topic) => {
      chatStateService.appendMessages([{ role: "assistant", content: topic.text }], configService.getConfig().chat.historyLimit);
    },
    generateTopic: () => {
      const appConfig = configService.getConfig();
      const recentHistory = chatStateService.listHistory(appConfig.chat.historyLimit).slice(-12);
      return generateProactiveTopic({
        modelService,
        providerConfig: { ...appConfig.model, apiKey: secretService.getApiKey() },
        appConfig,
        memorySummary: chatStateService.getMemory().summary,
        recentHistory,
      });
    },
  });

  const replyToProactiveTopic = createProactiveTopicReplyHandler({
    topics: proactiveTopics,
    openChat,
  });
  async function quickTranslateSelection() {
    try {
      const selectedText = await selectedTextService.readSelectedText();
      if (!selectedText) {
        showPetBubble("没有检测到选中文字", "thinking");
        openTranslator();
        return;
      }

      openTranslator(selectedText, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取选中文字失败";
      showPetBubble(message, "failed");
      openTranslator();
    }
  }

  function togglePetWindow() {
    if (petWindow.isVisible()) {
      petWindow.hide();
      return;
    }

    showPetWindow();
  }

  function showPetWindow() {
    petWindow.show();
    coreIpc.syncPetVitalsStatus();
  }

  async function startAreaCapture() {
    await startAreaCaptureWithHiddenPet({
      petWindow,
      screenshotService,
      preloadPath,
      hidePetWhenCapturing: configService.getConfig().screenshot.hidePetWhenCapturing,
    });
  }
  function toggleRecordingControl() {
    toggleRecordingControlWindow(recordingControlWindowState, () => createRecordingControlWindow(preloadPath, rendererIndexPath));
  }

  async function startRecording() {
    const recordingConfig = configService.getConfig().recording;
    try {
      if (recordingConfig.hidePetWhenRecording && petWindow.isVisible()) {
        petHiddenForRecording = true;
        petWindow.hide();
      }
      const result = await recordingService.start(recordingConfig);
      const warning = result.state.warnings[0]?.message;
      if (warning) {
        showPetBubble(`开始录屏，${warning}`, "thinking");
      }
      return result;
    } catch (error) {
      if (petHiddenForRecording) {
        petWindow.show();
        petHiddenForRecording = false;
      }
      const message = error instanceof Error ? error.message : "录屏启动失败";
      showPetBubble(message, "failed");
      throw error;
    }
  }

  async function stopRecording() {
    const current = recordingService.getState();
    const wasActive = current.status === "recording" || current.status === "stopping";
    const result = await recordingService.stop();
    if (petHiddenForRecording) {
      petWindow.show();
      petHiddenForRecording = false;
    }
    if (wasActive) {
      const warning = result.warnings[0]?.message;
      showPetBubble(warning ? `录屏已保存，${warning}` : "录屏已保存", warning ? "thinking" : "happy");
    }
    return result;
  }

  function registerShortcuts(config: AppConfig) {
    const activeShortcutIds = [
      ...pluginRegistry.getShortcuts().map((shortcut) => shortcut.id as keyof AppConfig["shortcuts"]),
      "togglePet" as const,
    ];
    const results = registerAppShortcuts(shortcutService, config.shortcuts, {
      captureArea() {
        void startAreaCapture();
      },
      openTranslator() {
        openTranslator();
      },
      quickTranslateSelection() {
        void quickTranslateSelection();
      },
      togglePet: togglePetWindow,
      toggleRecording() {
        toggleRecordingControl();
      },
    }, activeShortcutIds);
    const fallbackUsed = results.filter((result) => result.registered && result.fallbackUsed && result.registeredAccelerator);
    const failed = results.filter((result) => !result.registered);

    if (fallbackUsed.length > 0) {
      const labels = fallbackUsed.map((result) => result.registeredAccelerator).join("、");
      showPetBubble(`快捷键被占用，已改用 ${labels}`, "thinking");
    }

    if (failed.length > 0) {
      console.warn("Some shortcuts failed to register:", failed);
      showPetBubble(`有 ${failed.length} 个快捷键注册失败，可能被其它软件占用`, "failed");
    }
  }

  async function invokePluginAction(action: string): Promise<void> {
    if (action === "translator.open") {
      showPetEmotion("thinking", "正在打开翻译");
      openTranslator();
      return;
    }

    if (action === "chat.open") {
      showPetEmotion("thinking", "正在打开聊天");
      openChat();
      return;
    }

    if (action === "settings.open") {
      showPetEmotion("attentive", "正在打开设置");
      createSettingsWindow(preloadPath, rendererIndexPath);
      return;
    }

    if (action === "recording.toggle") {
      toggleRecordingControl();
      return;
    }

    if (action === "screenshot.capture") {
      showPetEmotion("thinking", "正在准备截图");
      await startAreaCapture();
      return;
    }

    if (action === "pet.vitals.toggleStatus") {
      const status = coreIpc.setPetVitalsStatusVisible();
      showPetBubble(status.visible ? "状态栏打开啦" : "状态栏收起来了", status.visible ? "happy" : "attentive");
      return;
    }

    showPetBubble(`功能 ${action} 已收到`, "attentive");
  }

  petVitalsService.onNeed((need) => {
    showPetBubble(need.message, need.emotion);
  });

  const coreIpc = registerCoreIpc({
    configService,
    preloadPath,
    rendererIndexPath,
    modelService,
    ocrService,
    screenshotService,
    recordingService,
    petSkinService,
    startRecording,
    stopRecording,
    pluginRegistry,
    chatStateService,
    petVitalsService,
    getModelProviderConfig() {
      return { ...configService.getConfig().model, apiKey: secretService.getApiKey() };
    },
    invokePluginAction,
    onPetVitalsAction(result) {
      showPetBubble(result.reaction, result.reactionEmotion);
    },
    onPetVitalsReset() {
      showPetBubble("养成状态已重置，我们重新开始吧", "waving");
    },
    onConfigChanged(nextConfig) {
      pluginRegistry.updateEnabledPlugins(nextConfig.plugins);
      if (nextConfig.pet.alwaysOnTop) {
        petWindow.setAlwaysOnTop(true, "screen-saver");
      } else {
        petWindow.setAlwaysOnTop(false);
      }
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(ipcChannels.configChanged, nextConfig);
      });
      registerShortcuts(nextConfig);
      proactiveTopicService.reschedule();
      coreIpc.syncPetVitalsStatus();
    },
    async setApiKey(nextApiKey: string) {
      secretService.setApiKey(nextApiKey);
      showPetBubble("API Key 已保存", "happy");
    },
    hasApiKey() {
      return secretService.hasApiKey();
    },
    getApiKeyStatus() {
      return secretService.getStorageStatus();
    },
    pinCapture(captureId: string) {
      createPinnedImageWindow(preloadPath, captureId, rendererIndexPath);
    },
    showScreenshotTip(message: string) {
      createScreenshotTipWindow(preloadPath, message, rendererIndexPath);
    },
    replyToProactiveTopic,
    petWindow,
    petPositionService,
  });

  registerShortcuts(configService.getConfig());
  proactiveTopicService.start();
  petVitalsService.start();
  coreIpc.syncPetVitalsStatus();
  app.on("will-quit", () => {
    coreIpc.persistPetVitalsStatusPosition();
    proactiveTopicService.stop();
    petVitalsService.stop();
    void stopRecording();
    shortcutService.unregisterAll();
  });

  tray = new Tray(createTrayIcon(appPaths.trayIconPath));
  tray.setToolTip("LacriTomato Mini");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示宠物", click: () => showPetWindow() },
    { label: "隐藏宠物", click: () => petWindow.hide() },
    { label: "宠物状态栏", click: () => coreIpc.setPetVitalsStatusVisible() },
    { label: "设置", click: () => createSettingsWindow(preloadPath, rendererIndexPath) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));
}

app.on("window-all-closed", () => {
  // Keep the tray-hosted pet app alive until the user explicitly exits.
});

main().catch((error) => {
  console.error(error);
  app.quit();
});
