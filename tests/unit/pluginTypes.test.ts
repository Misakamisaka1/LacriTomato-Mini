import { describe, expect, it } from "vitest";
import type { PetdexPluginManifest } from "../../src/shared/pluginTypes";

describe("plugin manifest contract", () => {
  it("supports menu, shortcut, settings, panels, and capabilities", () => {
    const manifest: PetdexPluginManifest = {
      id: "translator",
      name: "Translator",
      version: "0.1.0",
      menuItems: [{ id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" }],
      shortcuts: [{ id: "quickTranslate", label: "打开翻译", defaultAccelerator: "CommandOrControl+Shift+T" }],
      settingsSections: [{ id: "translator.settings", label: "翻译", rendererRoute: "translator-settings" }],
      panels: [{ id: "translator.panel", rendererRoute: "translator-panel", title: "翻译" }],
      capabilities: ["model:text"],
    };

    expect(manifest.menuItems[0].action).toBe("translator.open");
    expect(manifest.capabilities).toContain("model:text");
  });
});
