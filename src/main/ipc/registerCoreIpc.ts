import { BrowserWindow, dialog, ipcMain, screen, type Display, type OpenDialogOptions, type Rectangle } from "electron";
import type { ChatMessage, ChatRequest, ChatSendRequest } from "../../plugins/chat/types.js";
import { findChatPersonalityTemplate, findChatPromptTemplate } from "../../plugins/chat/templates.js";
import type { TranslateRequest } from "../../plugins/translator/types.js";
import type { AppConfig } from "../../shared/configSchema.js";
import { ipcChannels } from "../../shared/ipcChannels.js";
import type { PetBubble, PetEmotion } from "../../shared/petBehavior.js";
import type { PluginMenuItem } from "../../shared/pluginTypes.js";
import type { ScreenshotCaptureOptions, ScreenshotSelection } from "../../plugins/screenshot/workflow.js";
import type { ChatStateService } from "../services/chatStateService.js";
import type { ConfigService } from "../services/configService.js";
import type { ModelProviderConfig, ModelService } from "../services/modelService.js";
import type { OcrService } from "../services/ocrService.js";
import type { PluginRegistry } from "../services/pluginRegistry.js";
import type { PetSkinService } from "../services/petSkinService.js";
import { setPinnedImageFullscreenPreview } from "../services/pinnedImagePreview.js";
import { togglePinnedImageZoom } from "../services/pinnedImageZoom.js";
import type { ScreenshotService } from "../services/screenshotService.js";
import type { RecordingService } from "../services/recordingService.js";
import type { RecordingStartResult, RecordingStopResult } from "../../plugins/recording/types.js";
import {
  createPetBubbleWindow,
  createPetMenuWindow,
  getPetBubbleOverlayBounds,
  getPetBubbleOverlayHeight,
  getPetMenuOverlayLayout,
} from "../windows/petOverlayWindows.js";

export interface CoreIpcDependencies {
  configService: ConfigService;
  preloadPath?: string;
  rendererIndexPath?: string;
  modelService?: ModelService;
  ocrService?: OcrService;
  screenshotService?: ScreenshotService;
  recordingService?: RecordingService;
  petSkinService?: PetSkinService;
  startRecording?(): Promise<RecordingStartResult>;
  stopRecording?(): Promise<RecordingStopResult>;
  pluginRegistry: PluginRegistry;
  chatStateService?: ChatStateService;
  getModelProviderConfig?(): ModelProviderConfig;
  invokePluginAction(action: string): Promise<void>;
  onConfigChanged?(config: AppConfig): void;
  setApiKey?(apiKey: string): Promise<void>;
  hasApiKey?(): boolean;
  getApiKeyStatus?(): { saved: boolean; secure: boolean };
  pinCapture?(captureId: string): void;
  showScreenshotTip?(message: string): void;
  replyToProactiveTopic?(topicId: string): void;
}


function getVirtualDesktopBounds(displays: Display[]): Rectangle {
  const availableDisplays = displays.length > 0 ? displays : [screen.getPrimaryDisplay()];
  const left = Math.min(...availableDisplays.map((display) => display.bounds.x));
  const top = Math.min(...availableDisplays.map((display) => display.bounds.y));
  const right = Math.max(...availableDisplays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...availableDisplays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
function readDialogDefaultPath(payload: unknown) {
  const value = payload && typeof payload === "object" && "defaultPath" in payload
    ? (payload as { defaultPath?: unknown }).defaultPath
    : undefined;

  return typeof value === "string" && value.trim() ? value : undefined;
}

function readContentLength(value: unknown) {
  const length = Math.ceil(Number(value));
  return Number.isFinite(length) && length > 0 ? length : undefined;
}

const petMenuEdgeMarginPx = 24;

type PetMenuPlacement = "top" | "left" | "right";
function syncPetBodySize(window: BrowserWindow, width: number, height: number) {
  const bounds = window.getBounds();

  if (bounds.width === width && bounds.height === height) {
    return;
  }

  window.setBounds({
    x: bounds.x + Math.round((bounds.width - width) / 2),
    y: bounds.y + bounds.height - height,
    width,
    height,
  });
}

function choosePetMenuPlacement(window: BrowserWindow, menuWidth: number): PetMenuPlacement {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const menuLeft = bounds.x + Math.round((bounds.width - menuWidth) / 2);
  const safeLeft = workArea.x + petMenuEdgeMarginPx;
  const safeRight = workArea.x + workArea.width - petMenuEdgeMarginPx;

  if (menuLeft < safeLeft) {
    return "right";
  }

  if (menuLeft + menuWidth > safeRight) {
    return "left";
  }

  return "top";
}

const petEmotions: PetEmotion[] = ["attentive", "thinking", "happy", "sleepy"];

function isPetEmotion(value: unknown): value is PetEmotion {
  return typeof value === "string" && petEmotions.includes(value as PetEmotion);
}

function readPetBubbleLayerPayload(payload: unknown): PetBubble | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const candidate = payload as Partial<PetBubble>;
  if (typeof candidate.text !== "string" || !candidate.text.trim()) {
    return undefined;
  }

  return {
    text: candidate.text,
    emotion: isPetEmotion(candidate.emotion) ? candidate.emotion : "happy",
    actionLabel: typeof candidate.actionLabel === "string" ? candidate.actionLabel : undefined,
    action: candidate.action?.type === "chat.replyToTopic" && typeof candidate.action.topicId === "string"
      ? candidate.action
      : undefined,
  };
}

function readPetMenuItems(payload: unknown): PluginMenuItem[] {
  const source = payload && typeof payload === "object" && "items" in payload
    ? (payload as { items?: unknown }).items
    : payload;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.flatMap((item): PluginMenuItem[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<PluginMenuItem>;
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string" || typeof candidate.action !== "string") {
      return [];
    }

    return [{
      id: candidate.id,
      label: candidate.label,
      action: candidate.action,
      icon: typeof candidate.icon === "string" ? candidate.icon : "Settings",
      disabled: Boolean(candidate.disabled),
    }];
  });
}

function readMenuAction(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object" && "action" in payload && typeof (payload as { action?: unknown }).action === "string") {
    return (payload as { action: string }).action;
  }

  return undefined;
}

function broadcastPetSkinChanged(result: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(ipcChannels.petSkinChanged, result);
  });
}
function ensureChatStateService(deps: CoreIpcDependencies) {
  if (!deps.chatStateService) {
    throw new Error("聊天服务未就绪");
  }

  return deps.chatStateService;
}

function ensurePetSkinService(deps: CoreIpcDependencies) {
  if (!deps.petSkinService) {
    throw new Error("宠物皮肤服务未就绪");
  }

  return deps.petSkinService;
}

function readChatContent(request: ChatSendRequest) {
  const content = typeof request?.content === "string" ? request.content.trim() : "";
  if (!content) {
    throw new Error("请输入聊天内容");
  }

  return content;
}

function historyToModelMessages(history: Array<{ role: ChatMessage["role"]; content: string }>): ChatMessage[] {
  return history.map((message) => ({ role: message.role, content: message.content }));
}

function buildChatSystemContext(config: AppConfig, memorySummary: string) {
  const customPrompt = config.chat.customPrompt.trim();
  const memory = config.chat.memoryEnabled && memorySummary.trim() ? memorySummary : undefined;

  if (customPrompt) {
    return {
      behaviorPrompt: customPrompt,
      memorySummary: memory,
    };
  }

  const personality = findChatPersonalityTemplate(config.chat.personalityId);
  const promptTemplate = findChatPromptTemplate(config.chat.promptTemplateId);

  return {
    personalityPrompt: personality.prompt,
    behaviorPrompt: promptTemplate.prompt,
    memorySummary: memory,
  };
}
function ensureModelDeps(deps: CoreIpcDependencies) {
  if (!deps.modelService || !deps.getModelProviderConfig) {
    throw new Error("Model service is not configured");
  }

  return {
    modelService: deps.modelService,
    config: deps.getModelProviderConfig(),
  };
}

export function registerCoreIpc(deps: CoreIpcDependencies): void {
  let activePetWindow: BrowserWindow | undefined;
  let bubbleLayerWindow: BrowserWindow | undefined;
  let menuLayerWindow: BrowserWindow | undefined;
  let activeMenuItemCount = 0;
  let activeBubbleHeight = 72;

  function isWindowDestroyed(window: BrowserWindow) {
    return typeof window.isDestroyed === "function" && window.isDestroyed();
  }

  const hideBubbleLayer = () => {
    if (bubbleLayerWindow && !isWindowDestroyed(bubbleLayerWindow)) {
      bubbleLayerWindow.hide();
    }
  };

  const hideMenuLayer = () => {
    if (menuLayerWindow && !isWindowDestroyed(menuLayerWindow)) {
      menuLayerWindow.hide();
    }
  };

  const hidePetLayers = () => {
    hideBubbleLayer();
    hideMenuLayer();
  };

  function bindLayerSource(window: BrowserWindow) {
    if (activePetWindow === window) {
      return;
    }

    activePetWindow = window;
    window.on("hide", hidePetLayers);
    window.on("closed", hidePetLayers);
  }

  function getLayerPaths() {
    if (!deps.preloadPath || !deps.rendererIndexPath) {
      return undefined;
    }

    return { preloadPath: deps.preloadPath, rendererIndexPath: deps.rendererIndexPath };
  }

  function createBubbleLayer() {
    const paths = getLayerPaths();
    if (!paths) {
      return undefined;
    }

    if (!bubbleLayerWindow || isWindowDestroyed(bubbleLayerWindow)) {
      bubbleLayerWindow = createPetBubbleWindow(BrowserWindow, paths.preloadPath, deps.configService.getConfig().pet.alwaysOnTop);
      bubbleLayerWindow.on("closed", () => {
        bubbleLayerWindow = undefined;
      });
    }

    return { window: bubbleLayerWindow, rendererIndexPath: paths.rendererIndexPath };
  }

  function createMenuLayer() {
    const paths = getLayerPaths();
    if (!paths) {
      return undefined;
    }

    if (!menuLayerWindow || isWindowDestroyed(menuLayerWindow)) {
      menuLayerWindow = createPetMenuWindow(BrowserWindow, paths.preloadPath, deps.configService.getConfig().pet.alwaysOnTop);
      menuLayerWindow.on("closed", () => {
        menuLayerWindow = undefined;
      });
    }

    return { window: menuLayerWindow, rendererIndexPath: paths.rendererIndexPath };
  }

  function repositionPetLayers(sourceWindow: BrowserWindow) {
    if (isWindowDestroyed(sourceWindow)) {
      return;
    }

    const petBounds = sourceWindow.getBounds();
    const workArea = screen.getDisplayMatching(petBounds).workArea;

    if (bubbleLayerWindow && !isWindowDestroyed(bubbleLayerWindow) && bubbleLayerWindow.isVisible()) {
      bubbleLayerWindow.setBounds(getPetBubbleOverlayBounds(petBounds, workArea, activeBubbleHeight));
    }

    if (menuLayerWindow && !isWindowDestroyed(menuLayerWindow) && menuLayerWindow.isVisible()) {
      menuLayerWindow.setBounds(getPetMenuOverlayLayout(petBounds, workArea, activeMenuItemCount).bounds);
    }
  }
  deps.recordingService?.onStateChanged((state) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(ipcChannels.recordingStateChanged, state);
    });
  });
  ipcMain.handle(ipcChannels.configGet, () => deps.configService.getConfig());
  ipcMain.handle(ipcChannels.configSet, (_event, update) => {
    const nextConfig = deps.configService.setConfig(update);
    deps.onConfigChanged?.(nextConfig);
    return nextConfig;
  });
  ipcMain.handle(ipcChannels.dialogSelectDirectory, async (event, payload: unknown) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: "\u9009\u62e9\u4fdd\u5b58\u6587\u4ef6\u5939",
      defaultPath: readDialogDefaultPath(payload),
      properties: ["openDirectory", "createDirectory"],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle(ipcChannels.petSkinGetCurrent, () => ensurePetSkinService(deps).getCurrentSkin());
  ipcMain.handle(ipcChannels.petSkinImportFolder, async (event) => {
    const petSkinService = ensurePetSkinService(deps);
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: "选择宠物皮肤文件夹",
      properties: ["openDirectory"],
    };
    const selection = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (selection.canceled || !selection.filePaths[0]) {
      return undefined;
    }

    const selectedPath = selection.filePaths[0];
    const result = petSkinService.importSkinFolder(selectedPath);
    if (!result.fallbackUsed) {
      const nextConfig = deps.configService.setConfig({ pet: { skinSourcePath: selectedPath } });
      deps.onConfigChanged?.(nextConfig);
    }
    broadcastPetSkinChanged(result);
    return result;
  });
  ipcMain.handle(ipcChannels.petSkinReset, async () => {
    const result = ensurePetSkinService(deps).resetSkin();
    const nextConfig = deps.configService.setConfig({ pet: { skinSourcePath: "" } });
    deps.onConfigChanged?.(nextConfig);
    broadcastPetSkinChanged(result);
    return result;
  });
  ipcMain.handle(ipcChannels.petSkinOpenPetdex, async () => {
    await ensurePetSkinService(deps).openPetdex();
  });
  ipcMain.handle(ipcChannels.secureConfigSetApiKey, async (_event, apiKey: string) => {
    await deps.setApiKey?.(apiKey);
  });
  ipcMain.handle(ipcChannels.secureConfigHasApiKey, () => deps.hasApiKey?.() ?? false);
  ipcMain.handle(ipcChannels.secureConfigGetApiKeyStatus, () => deps.getApiKeyStatus?.() ?? {
    saved: deps.hasApiKey?.() ?? false,
    secure: false,
  });
  ipcMain.handle(ipcChannels.modelTranslate, (_event, request: TranslateRequest) => {
    const { modelService, config } = ensureModelDeps(deps);
    return modelService.translate(request, config);
  });
  ipcMain.handle(ipcChannels.modelChat, (_event, request: ChatRequest) => {
    const { modelService, config } = ensureModelDeps(deps);
    return modelService.chat(request, config);
  });
  ipcMain.handle(ipcChannels.modelTestConnection, () => {
    const { modelService, config } = ensureModelDeps(deps);
    return modelService.testConnection(config);
  });
  ipcMain.handle(ipcChannels.chatHistoryList, () => {
    const config = deps.configService.getConfig();
    return ensureChatStateService(deps).listHistory(config.chat.historyLimit);
  });
  ipcMain.handle(ipcChannels.chatHistoryClear, () => ensureChatStateService(deps).clearHistory());
  ipcMain.handle(ipcChannels.chatMemoryGet, () => ensureChatStateService(deps).getMemory());
  ipcMain.handle(ipcChannels.chatMemorySet, (_event, summary: unknown) => {
    return ensureChatStateService(deps).setMemory(typeof summary === "string" ? summary : "");
  });
  ipcMain.handle(ipcChannels.chatMemoryClear, () => ensureChatStateService(deps).clearMemory());
  ipcMain.handle(ipcChannels.chatSend, async (_event, request: ChatSendRequest) => {
    const content = readChatContent(request);
    const chatStateService = ensureChatStateService(deps);
    const { modelService, config: providerConfig } = ensureModelDeps(deps);
    const appConfig = deps.configService.getConfig();
    const memory = chatStateService.getMemory();
    const history = chatStateService.listHistory(appConfig.chat.historyLimit);
    const userMessage: ChatMessage = { role: "user", content };
    const result = await modelService.chat({
      messages: [...historyToModelMessages(history), userMessage],
      systemContext: buildChatSystemContext(appConfig, memory.summary),
    }, providerConfig);
    const nextHistory = chatStateService.appendMessages([userMessage, result.message], appConfig.chat.historyLimit);
    const nextMemory = chatStateService.updateMemoryFromUserMessage(content, appConfig.chat.memoryEnabled);

    return {
      ...result,
      history: nextHistory,
      memory: nextMemory,
    };
  });
  ipcMain.handle(ipcChannels.chatProactiveTopicReply, (_event, payload: unknown) => {
    const topicId = typeof payload === "string"
      ? payload
      : payload && typeof payload === "object" && "topicId" in payload && typeof payload.topicId === "string"
        ? payload.topicId
        : "";
    deps.replyToProactiveTopic?.(topicId);
  });
  ipcMain.handle(ipcChannels.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(ipcChannels.windowTogglePinnedImageZoom, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return { zoomed: false };
    }

    return togglePinnedImageZoom(window);
  });
  ipcMain.handle(ipcChannels.windowSetPinnedImagePreview, (event, previewing: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return { previewing: false };
    }

    return setPinnedImageFullscreenPreview(window, Boolean(previewing));
  });
  ipcMain.handle(ipcChannels.petMoveBy, (event, delta: { deltaX?: unknown; deltaY?: unknown }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const deltaX = Math.round(Number(delta.deltaX));
    const deltaY = Math.round(Number(delta.deltaY));

    if (!window || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return;
    }

    const [x, y] = window.getPosition();
    window.setPosition(x + deltaX, y + deltaY);
    repositionPetLayers(window);
  });
  ipcMain.handle(ipcChannels.petSyncBodySize, (event, size: { width?: unknown; height?: unknown }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const width = readContentLength(size.width);
    const height = readContentLength(size.height);

    if (!window || !width || !height) {
      return;
    }

    syncPetBodySize(window, width, height);
    repositionPetLayers(window);
  });
  ipcMain.handle(ipcChannels.petShowBubbleLayer, (event, payload: unknown) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const bubble = readPetBubbleLayerPayload(payload);
    const layer = createBubbleLayer();

    if (!sourceWindow || !bubble || !layer) {
      return;
    }

    bindLayerSource(sourceWindow);
    const petBounds = sourceWindow.getBounds();
    const workArea = screen.getDisplayMatching(petBounds).workArea;
    activeBubbleHeight = getPetBubbleOverlayHeight(bubble);
    layer.window.setBounds(getPetBubbleOverlayBounds(petBounds, workArea, activeBubbleHeight));
    void layer.window.loadFile(layer.rendererIndexPath, {
      query: {
        view: "pet-bubble",
        text: bubble.text,
        emotion: bubble.emotion,
        actionLabel: bubble.actionLabel ?? "",
        topicId: bubble.action?.topicId ?? "",
      },
    }).then(() => {
      if (!isWindowDestroyed(layer.window)) {
        layer.window.showInactive();
      }
    }).catch(() => undefined);
  });
  ipcMain.handle(ipcChannels.petHideBubbleLayer, () => {
    hideBubbleLayer();
  });
  ipcMain.handle(ipcChannels.petShowMenuLayer, (event, payload: unknown) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const items = readPetMenuItems(payload);
    const layer = createMenuLayer();

    if (!sourceWindow || !layer) {
      return;
    }

    bindLayerSource(sourceWindow);
    activeMenuItemCount = items.length;
    const petBounds = sourceWindow.getBounds();
    const workArea = screen.getDisplayMatching(petBounds).workArea;
    const layout = getPetMenuOverlayLayout(petBounds, workArea, items.length);
    layer.window.setBounds(layout.bounds);
    void layer.window.loadFile(layer.rendererIndexPath, {
      query: {
        view: "pet-menu",
        placement: layout.placement,
        items: JSON.stringify(items),
      },
    }).then(() => {
      if (!isWindowDestroyed(layer.window)) {
        layer.window.showInactive();
      }
    }).catch(() => undefined);
  });
  ipcMain.handle(ipcChannels.petHideMenuLayer, () => {
    activeMenuItemCount = 0;
    hideMenuLayer();
  });
  ipcMain.handle(ipcChannels.petSelectMenuAction, (_event, payload: unknown) => {
    const action = readMenuAction(payload);

    if (!action) {
      return;
    }

    hideMenuLayer();
    if (activePetWindow && !isWindowDestroyed(activePetWindow)) {
      activePetWindow.webContents.send(ipcChannels.petMenuAction, action);
    }
  });
  ipcMain.handle(ipcChannels.petChooseMenuPlacement, (event, size: { menuWidth?: unknown }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const menuWidth = readContentLength(size.menuWidth);

    if (!window || !menuWidth) {
      return "top";
    }

    return choosePetMenuPlacement(window, menuWidth);
  });
  ipcMain.handle(ipcChannels.screenshotCaptureSelection, (event, selection: ScreenshotSelection, options?: ScreenshotCaptureOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !deps.screenshotService) {
      throw new Error("截图服务未就绪");
    }

    return deps.screenshotService.captureSelection(window, selection, options);
  });
  ipcMain.handle(ipcChannels.screenshotUpdateCapture, (_event, captureId: string, dataUrl: string) => {
    if (!deps.screenshotService) {
      throw new Error("截图服务未就绪");
    }

    return deps.screenshotService.updateCapture(captureId, dataUrl);
  });
  ipcMain.handle(ipcChannels.screenshotCopyCapture, (_event, captureId: string) => {
    deps.screenshotService?.copyCapture(captureId);
  });
  ipcMain.handle(ipcChannels.screenshotSaveCapture, (_event, captureId: string) => {
    if (!deps.screenshotService) {
      throw new Error("截图服务未就绪");
    }

    return deps.screenshotService.saveCapture(captureId, deps.configService.getConfig().screenshot);
  });
  ipcMain.handle(ipcChannels.screenshotOcrCapture, async (_event, captureId: string) => {
    if (!deps.screenshotService || !deps.ocrService) {
      throw new Error("OCR 服务未就绪");
    }

    const config = deps.configService.getConfig();
    return deps.ocrService.recognize(deps.screenshotService.getCapturePng(captureId), config.ocr);
  });
  ipcMain.handle(ipcChannels.screenshotPinCapture, (_event, captureId: string) => {
    deps.pinCapture?.(captureId);
  });
  ipcMain.handle(ipcChannels.screenshotGetCapture, (_event, captureId: string) => deps.screenshotService?.getCapture(captureId));
  ipcMain.handle(ipcChannels.screenshotListWindowTargets, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !deps.screenshotService) {
      return [];
    }

    return deps.screenshotService.listWindowTargets(window);
  });
  ipcMain.handle(ipcChannels.screenshotGetCursorPoint, (event) => {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const bounds = getVirtualDesktopBounds(screen.getAllDisplays());
    const window = BrowserWindow.fromWebContents(event.sender);

    if (window) {
      const currentBounds = window.getBounds();
      const boundsChanged = currentBounds.x !== bounds.x
        || currentBounds.y !== bounds.y
        || currentBounds.width !== bounds.width
        || currentBounds.height !== bounds.height;

      if (boundsChanged) {
        window.setBounds(bounds);
      }
    }

    return {
      x: point.x - bounds.x,
      y: point.y - bounds.y,
      displayChanged: false,
      displayId: display.id,
      displaySize: {
        width: bounds.width,
        height: bounds.height,
      },
    };
  });
  ipcMain.handle(ipcChannels.screenshotCloseOverlay, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(ipcChannels.screenshotShowTip, (_event, message: unknown) => {
    const nextMessage = typeof message === "string" && message.trim() ? message.trim() : "截图已复制到剪贴板";
    deps.showScreenshotTip?.(nextMessage);
  });
  ipcMain.handle(ipcChannels.ocrRecognize, async (_event, image: Buffer, options: AppConfig["ocr"]) => {
    if (!deps.ocrService) {
      throw new Error("OCR 服务未就绪");
    }

    return deps.ocrService.recognize(image, options);
  });
  ipcMain.handle(ipcChannels.recordingStateGet, () => deps.recordingService?.getState() ?? { status: "idle", warnings: [] });
  ipcMain.handle(ipcChannels.recordingStart, () => {
    if (deps.startRecording) {
      return deps.startRecording();
    }

    if (!deps.recordingService) {
      throw new Error("录屏服务未就绪");
    }

    return deps.recordingService.start(deps.configService.getConfig().recording);
  });
  ipcMain.handle(ipcChannels.recordingStop, () => {
    if (deps.stopRecording) {
      return deps.stopRecording();
    }

    if (!deps.recordingService) {
      throw new Error("录屏服务未就绪");
    }

    return deps.recordingService.stop();
  });
  ipcMain.handle(ipcChannels.recordingListAudioDevices, () => deps.recordingService?.listAudioDevices() ?? []);
  ipcMain.handle(ipcChannels.pluginListMenuItems, () => deps.pluginRegistry.getMenuItems());
  ipcMain.handle(ipcChannels.pluginListContributions, () => deps.pluginRegistry.getContributions());
  ipcMain.handle(ipcChannels.pluginInvokeAction, (_event, action: string) => deps.invokePluginAction(action));
}





