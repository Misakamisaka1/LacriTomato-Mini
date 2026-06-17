import type { PetdexPluginManifest } from "../../shared/pluginTypes.js";

export const translatorManifest: PetdexPluginManifest = {
  id: "translator",
  name: "翻译",
  version: "0.1.0",
  menuItems: [
    { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
  ],
  shortcuts: [
    { id: "openTranslator", label: "打开翻译", defaultAccelerator: "CommandOrControl+Shift+T" },
    { id: "quickTranslateSelection", label: "选中文字翻译", defaultAccelerator: "CommandOrControl+Shift+Y" },
  ],
  settingsSections: [
    { id: "translator.settings", label: "翻译", rendererRoute: "translator-settings" },
  ],
  panels: [
    { id: "translator.panel", title: "翻译", rendererRoute: "translator-panel" },
  ],
  capabilities: ["model:text", "clipboard:text"],
};
