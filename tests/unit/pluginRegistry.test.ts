import { describe, expect, it } from "vitest";
import { chatManifest } from "../../src/plugins/chat/manifest";
import { createPluginRegistry } from "../../src/main/services/pluginRegistry";
import { recordingManifest } from "../../src/plugins/recording/manifest";
import { screenshotManifest } from "../../src/plugins/screenshot/manifest";
import { translatorManifest } from "../../src/plugins/translator/manifest";

const manifests = [translatorManifest, screenshotManifest, chatManifest, recordingManifest];

describe("plugin registry", () => {
  it("collects menu items from enabled plugins", () => {
    const registry = createPluginRegistry(manifests, {
      translator: true,
      screenshot: true,
      chat: true,
      recording: true,
    });

    expect(registry.getMenuItems().map((item) => item.label)).toEqual([
      "翻译",
      "截图",
      "和我聊天",
      "录屏",
    ]);
  });

  it("collects shortcut, settings, and panel contributions from enabled plugins", () => {
    const registry = createPluginRegistry(manifests, {
      translator: true,
      screenshot: true,
      chat: false,
      recording: true,
    });

    expect(registry.getShortcuts().map((shortcut) => shortcut.id)).toEqual([
      "openTranslator",
      "quickTranslateSelection",
      "captureArea",
      "toggleRecording",
    ]);
    expect(registry.getSettingsSections().map((section) => section.label)).toEqual([
      "翻译",
      "截图",
      "OCR",
      "录屏",
    ]);
    expect(registry.getPanels().map((panel) => panel.id)).toEqual([
      "translator.panel",
      "screenshot.overlay",
    ]);
  });

  it("skips disabled plugin contributions", () => {
    const registry = createPluginRegistry(manifests, {
      translator: false,
      screenshot: true,
      chat: false,
      recording: false,
    });

    expect(registry.getMenuItems().map((item) => item.label)).toEqual(["截图"]);
    expect(registry.getShortcuts().map((shortcut) => shortcut.id)).toEqual(["captureArea"]);
    expect(registry.getSettingsSections().map((section) => section.label)).toEqual(["截图", "OCR"]);
  });

  it("updates enabled plugin contributions when settings change", () => {
    const registry = createPluginRegistry(manifests, {
      translator: true,
      screenshot: true,
      chat: true,
      recording: true,
    });

    registry.updateEnabledPlugins({ translator: false, screenshot: true, chat: false, recording: false });

    expect(registry.getMenuItems().map((item) => item.label)).toEqual([
      "截图",
    ]);
    expect(registry.findAction("translator.open")).toBeUndefined();
    expect(registry.findAction("chat.open")).toBeUndefined();
    expect(registry.findAction("recording.toggle")).toBeUndefined();
  });

  it("returns plugin metadata with enabled state and capabilities for settings", () => {
    const registry = createPluginRegistry(manifests, {
      translator: true,
      screenshot: false,
      chat: true,
      recording: true,
    });

    expect(registry.getContributions().plugins).toEqual([
      expect.objectContaining({ id: "translator", name: "翻译", enabled: true, capabilities: ["model:text", "clipboard:text"] }),
      expect.objectContaining({ id: "screenshot", name: "截图", enabled: false, capabilities: ["screen:capture", "clipboard:image", "file:save", "ocr:local"] }),
      expect.objectContaining({ id: "chat", name: "聊天", enabled: true, capabilities: ["model:text", "pet:behavior"] }),
      expect.objectContaining({ id: "recording", name: "录屏", enabled: true, capabilities: ["screen:record", "audio:system-loopback", "audio:microphone", "file:save"] }),
    ]);
  });
});