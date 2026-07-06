import { describe, expect, it } from "vitest";
import { chatPersonalityTemplates, chatPromptTemplates } from "../../src/plugins/chat/templates";
import { appConfigSchema, defaultAppConfig } from "../../src/shared/configSchema";

describe("config schema", () => {
  it("accepts default app config", () => {
    expect(() => appConfigSchema.parse(defaultAppConfig)).not.toThrow();
  });

  it("uses recommended shortcut defaults", () => {
    expect(defaultAppConfig.shortcuts.captureArea).toBe("CommandOrControl+Shift+A");
    expect(defaultAppConfig.shortcuts.openTranslator).toBe("CommandOrControl+Shift+T");
    expect(defaultAppConfig.shortcuts.togglePet).toBe("CommandOrControl+Shift+P");
    expect(defaultAppConfig.shortcuts.toggleRecording).toBe("CommandOrControl+Shift+R");
  });

  it("enables the core plugins by default", () => {
    expect(defaultAppConfig.plugins).toEqual({
      translator: true,
      screenshot: true,
      chat: true,
      recording: true,
    });
  });

  it("does not expose the removed screenshot OCR shortcut", () => {
    expect("captureOcr" in defaultAppConfig.shortcuts).toBe(false);
  });

  it("uses accepted pet default size", () => {
    expect(defaultAppConfig.pet.defaultHeight).toBe(224);
  });

  it("defaults pet skin source to bundled skin", () => {
    expect(defaultAppConfig.pet.skinSourcePath).toBe("");
    expect(appConfigSchema.parse(defaultAppConfig).pet.skinSourcePath).toBe("");
  });

  it("keeps automatic wandering disabled by default", () => {
    expect(defaultAppConfig.pet.wanderEnabled).toBe(false);
  });

  it("uses recommended chat defaults", () => {
    expect(defaultAppConfig.chat).toEqual({
      personalityId: "warm-companion",
      promptTemplateId: "daily-companion",
      customPrompt: "",
      historyLimit: 200,
      memoryEnabled: true,
      proactiveTopicsEnabled: true,
      proactiveTopicMinMinutes: 20,
      proactiveTopicMaxMinutes: 60,
    });
  });

  it("uses recommended recording defaults", () => {
    expect(defaultAppConfig.recording).toEqual({
      enabled: true,
      saveDirectoryName: "recordings",
      saveDirectoryPath: "",
      filenamePattern: "lacritomato-recording-yyyyMMdd-HHmmss",
      qualityPreset: "1080p",
      frameRate: 30,
      videoBitrateKbps: 8000,
      recordSystemAudio: true,
      recordMicrophone: false,
      microphoneDeviceName: "",
      audioMode: "mixed",
      captureCursor: true,
      hidePetWhenRecording: true,
    });
    expect(() => appConfigSchema.parse(defaultAppConfig)).not.toThrow();
  });

  it("allows custom screenshot and recording save folders", () => {
    expect(defaultAppConfig.screenshot).toMatchObject({
      saveDirectoryName: "screenshots",
      saveDirectoryPath: "",
    });
    expect(defaultAppConfig.recording).toMatchObject({
      saveDirectoryName: "recordings",
      saveDirectoryPath: "",
    });

    expect(() => appConfigSchema.parse({
      ...defaultAppConfig,
      screenshot: {
        ...defaultAppConfig.screenshot,
        saveDirectoryPath: "D:/captures/screenshots",
      },
      recording: {
        ...defaultAppConfig.recording,
        saveDirectoryPath: "D:/captures/recordings",
      },
    })).not.toThrow();
  });

  it("ships personality and prompt templates for pet chat", () => {
    expect(chatPersonalityTemplates.map((template) => template.id)).toEqual([
      "warm-companion",
      "playful-tomato",
      "focus-coach",
      "quiet-listener",
    ]);
    expect(chatPromptTemplates.map((template) => template.id)).toEqual([
      "daily-companion",
      "work-buddy",
      "emotional-support",
      "study-partner",
    ]);
  });
});
