import type { AppConfig } from "../shared/configSchema.js";
import type { PetBubble, PetEmotionPayload } from "../shared/petBehavior.js";
import type { PetSkinLoadResult } from "../shared/petManifest.js";
import type { ChatHistoryEntry, ChatMemoryState, ChatProactiveTopic, ChatSendRequest, ChatSendResult } from "../plugins/chat/types.js";
import type { PluginContributions, PluginMenuItem } from "../shared/pluginTypes.js";
import type { RecordingAudioDevice, RecordingStartResult, RecordingState, RecordingStopResult } from "../plugins/recording/types.js";
import type {
  ScreenshotCaptureOptions,
  ScreenshotCaptureResult,
  ScreenshotOcrResult,
  ScreenshotSaveResult,
  ScreenshotCursorPoint,
  ScreenshotSelection,
  ScreenshotWindowTarget,
} from "../plugins/screenshot/workflow.js";
import type { ModelConnectionResult } from "../main/services/modelService.js";
import type { PinnedImagePreviewResult } from "../main/services/pinnedImagePreview.js";
import type { PinnedImageZoomResult } from "../main/services/pinnedImageZoom.js";

export interface PetdexApi {
  config: {
    get(): Promise<AppConfig>;
    set(update: Partial<AppConfig>): Promise<AppConfig>;
    setApiKey(apiKey: string): Promise<void>;
    hasApiKey(): Promise<boolean>;
    getApiKeyStatus?(): Promise<{ saved: boolean; secure: boolean }>;
    onChanged?(callback: (config: AppConfig) => void): () => void;
  };
  dialog?: {
    selectDirectory(defaultPath?: string): Promise<string | undefined>;
  };
  plugins: {
    listMenuItems(): Promise<PluginMenuItem[]>;
    listContributions(): Promise<PluginContributions>;
    invokeAction(action: string): Promise<void>;
  };
  model: {
    translate(request: unknown): Promise<unknown>;
    chat(request: unknown): Promise<unknown>;
    testConnection(): Promise<ModelConnectionResult>;
  };
  chat?: {
    listHistory(): Promise<ChatHistoryEntry[]>;
    clearHistory(): Promise<ChatHistoryEntry[]>;
    getMemory(): Promise<ChatMemoryState>;
    setMemory(summary: string): Promise<ChatMemoryState>;
    clearMemory(): Promise<ChatMemoryState>;
    send(request: ChatSendRequest): Promise<ChatSendResult>;
    replyToProactiveTopic(topicId: string): Promise<void>;
  };
  recording?: {
    getState(): Promise<RecordingState>;
    start(): Promise<RecordingStartResult>;
    stop(): Promise<RecordingStopResult>;
    listAudioDevices(): Promise<RecordingAudioDevice[]>;
    onStateChanged(callback: (state: RecordingState) => void): () => void;
  };  windowControls: {
    close(): Promise<void>;
    togglePinnedImageZoom?(): Promise<PinnedImageZoomResult>;
    setPinnedImagePreview?(previewing: boolean): Promise<PinnedImagePreviewResult>;
  };
  pet?: {
    moveBy(deltaX: number, deltaY: number): Promise<void>;
    syncBodySize(width: number, height: number): Promise<void>;
    showBubbleLayer(bubble: PetBubble): Promise<void>;
    hideBubbleLayer(): Promise<void>;
    showMenuLayer(items: PluginMenuItem[]): Promise<void>;
    hideMenuLayer(): Promise<void>;
    selectMenuAction(action: string): Promise<void>;
    chooseMenuPlacement(menuWidth: number): Promise<"top" | "left" | "right">;
    getCurrentSkin(): Promise<PetSkinLoadResult>;
    importSkinFolder(): Promise<PetSkinLoadResult | undefined>;
    resetSkin(): Promise<PetSkinLoadResult>;
    openPetdex(): Promise<void>;
    onSkinChanged(callback: (result: PetSkinLoadResult) => void): () => void;
    onMenuAction(callback: (action: string) => void): () => void;
    onBubble(callback: (message: string | PetBubble) => void): () => void;
    onEmotion(callback: (payload: PetEmotionPayload) => void): () => void;
    onOpenMenu(callback: () => void): () => void;
  };
  screenshot?: {
    captureSelection(selection: ScreenshotSelection, options?: ScreenshotCaptureOptions): Promise<ScreenshotCaptureResult>;
    updateCapture(captureId: string, dataUrl: string): Promise<ScreenshotCaptureResult>;
    copyCapture(captureId: string): Promise<void>;
    saveCapture(captureId: string): Promise<ScreenshotSaveResult>;
    ocrCapture(captureId: string): Promise<ScreenshotOcrResult>;
    pinCapture(captureId: string): Promise<void>;
    getCapture(captureId: string): Promise<ScreenshotCaptureResult | undefined>;
    listWindowTargets(): Promise<ScreenshotWindowTarget[]>;
    getCursorPoint(): Promise<ScreenshotCursorPoint>;
    showTip(message: string): Promise<void>;
    closeOverlay(): Promise<void>;
  };
}

declare global {
  interface Window {
    petdex?: PetdexApi;
  }
}




