import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type { AppConfig } from "../shared/configSchema.js";
import type { PetEmotionPayload } from "../shared/petBehavior.js";
import type { RecordingState } from "../plugins/recording/types.js";
import { ipcChannels } from "../shared/ipcChannels.js";
import type { PetdexApi } from "./api.js";

const api: PetdexApi = {
  config: {
    get: () => ipcRenderer.invoke(ipcChannels.configGet),
    set: (update) => ipcRenderer.invoke(ipcChannels.configSet, update),
    setApiKey: (apiKey) => ipcRenderer.invoke(ipcChannels.secureConfigSetApiKey, apiKey),
    hasApiKey: () => ipcRenderer.invoke(ipcChannels.secureConfigHasApiKey),
    getApiKeyStatus: () => ipcRenderer.invoke(ipcChannels.secureConfigGetApiKeyStatus),
    onChanged: (callback) => {
      const listener = (_event: IpcRendererEvent, config: AppConfig) => callback(config);
      ipcRenderer.on(ipcChannels.configChanged, listener);
      return () => ipcRenderer.removeListener(ipcChannels.configChanged, listener);
    },
  },
  dialog: {
    selectDirectory: (defaultPath) => ipcRenderer.invoke(ipcChannels.dialogSelectDirectory, { defaultPath }),
  },
  plugins: {
    listMenuItems: () => ipcRenderer.invoke(ipcChannels.pluginListMenuItems),
    listContributions: () => ipcRenderer.invoke(ipcChannels.pluginListContributions),
    invokeAction: (action) => ipcRenderer.invoke(ipcChannels.pluginInvokeAction, action),
  },
  model: {
    translate: (request) => ipcRenderer.invoke(ipcChannels.modelTranslate, request),
    chat: (request) => ipcRenderer.invoke(ipcChannels.modelChat, request),
    testConnection: () => ipcRenderer.invoke(ipcChannels.modelTestConnection),
  },
  chat: {
    listHistory: () => ipcRenderer.invoke(ipcChannels.chatHistoryList),
    clearHistory: () => ipcRenderer.invoke(ipcChannels.chatHistoryClear),
    getMemory: () => ipcRenderer.invoke(ipcChannels.chatMemoryGet),
    setMemory: (summary) => ipcRenderer.invoke(ipcChannels.chatMemorySet, summary),
    clearMemory: () => ipcRenderer.invoke(ipcChannels.chatMemoryClear),
    send: (request) => ipcRenderer.invoke(ipcChannels.chatSend, request),
    replyToProactiveTopic: (topicId) => ipcRenderer.invoke(ipcChannels.chatProactiveTopicReply, { topicId }),
  },
  windowControls: {
    close: () => ipcRenderer.invoke(ipcChannels.windowClose),
    togglePinnedImageZoom: () => ipcRenderer.invoke(ipcChannels.windowTogglePinnedImageZoom),
    setPinnedImagePreview: (previewing) => ipcRenderer.invoke(ipcChannels.windowSetPinnedImagePreview, previewing),
  },
  pet: {
    moveBy: (deltaX, deltaY) => ipcRenderer.invoke(ipcChannels.petMoveBy, { deltaX, deltaY }),
    syncBodySize: (width, height) => ipcRenderer.invoke(ipcChannels.petSyncBodySize, { width, height }),
    showBubbleLayer: (bubble) => ipcRenderer.invoke(ipcChannels.petShowBubbleLayer, bubble),
    hideBubbleLayer: () => ipcRenderer.invoke(ipcChannels.petHideBubbleLayer),
    showMenuLayer: (items) => ipcRenderer.invoke(ipcChannels.petShowMenuLayer, { items }),
    hideMenuLayer: () => ipcRenderer.invoke(ipcChannels.petHideMenuLayer),
    selectMenuAction: (action) => ipcRenderer.invoke(ipcChannels.petSelectMenuAction, { action }),
    chooseMenuPlacement: (menuWidth) => ipcRenderer.invoke(ipcChannels.petChooseMenuPlacement, { menuWidth }),
    onBubble: (callback) => {
      const listener = (_event: IpcRendererEvent, message: unknown) => {
        if (typeof message === "string" || (message && typeof message === "object")) {
          callback(message as never);
        }
      };
      ipcRenderer.on(ipcChannels.petBubble, listener);
      return () => ipcRenderer.removeListener(ipcChannels.petBubble, listener);
    },
    onEmotion: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: PetEmotionPayload) => callback(payload);
      ipcRenderer.on(ipcChannels.petEmotion, listener);
      return () => ipcRenderer.removeListener(ipcChannels.petEmotion, listener);
    },
    onOpenMenu: (callback) => {
      const listener = () => callback();
      ipcRenderer.on(ipcChannels.petOpenMenu, listener);
      return () => ipcRenderer.removeListener(ipcChannels.petOpenMenu, listener);
    },
    onMenuAction: (callback) => {
      const listener = (_event: IpcRendererEvent, action: unknown) => {
        if (typeof action === "string") {
          callback(action);
        }
      };
      ipcRenderer.on(ipcChannels.petMenuAction, listener);
      return () => ipcRenderer.removeListener(ipcChannels.petMenuAction, listener);
    },
  },
  recording: {
    getState: () => ipcRenderer.invoke(ipcChannels.recordingStateGet),
    start: () => ipcRenderer.invoke(ipcChannels.recordingStart),
    stop: () => ipcRenderer.invoke(ipcChannels.recordingStop),
    listAudioDevices: () => ipcRenderer.invoke(ipcChannels.recordingListAudioDevices),
    onStateChanged: (callback) => {
      const listener = (_event: IpcRendererEvent, state: RecordingState) => callback(state);
      ipcRenderer.on(ipcChannels.recordingStateChanged, listener);
      return () => ipcRenderer.removeListener(ipcChannels.recordingStateChanged, listener);
    },
  },  screenshot: {
    captureSelection: (selection, options) => ipcRenderer.invoke(ipcChannels.screenshotCaptureSelection, selection, options),
    updateCapture: (captureId, dataUrl) => ipcRenderer.invoke(ipcChannels.screenshotUpdateCapture, captureId, dataUrl),
    copyCapture: (captureId) => ipcRenderer.invoke(ipcChannels.screenshotCopyCapture, captureId),
    saveCapture: (captureId) => ipcRenderer.invoke(ipcChannels.screenshotSaveCapture, captureId),
    ocrCapture: (captureId) => ipcRenderer.invoke(ipcChannels.screenshotOcrCapture, captureId),
    pinCapture: (captureId) => ipcRenderer.invoke(ipcChannels.screenshotPinCapture, captureId),
    getCapture: (captureId) => ipcRenderer.invoke(ipcChannels.screenshotGetCapture, captureId),
    listWindowTargets: () => ipcRenderer.invoke(ipcChannels.screenshotListWindowTargets),
    getCursorPoint: () => ipcRenderer.invoke(ipcChannels.screenshotGetCursorPoint),
    showTip: (message) => ipcRenderer.invoke(ipcChannels.screenshotShowTip, message),
    closeOverlay: () => ipcRenderer.invoke(ipcChannels.screenshotCloseOverlay),
  },
};

contextBridge.exposeInMainWorld("petdex", api);


