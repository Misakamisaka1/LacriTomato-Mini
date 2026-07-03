import type { PetdexPluginManifest } from "../../shared/pluginTypes.js";

export const chatManifest: PetdexPluginManifest = {
  id: "chat",
  name: "聊天",
  version: "0.1.0",
  menuItems: [
    { id: "chat.open", label: "和我聊天", action: "chat.open", icon: "MessageCircle" },
  ],
  settingsSections: [
    { id: "chat.settings", label: "聊天", rendererRoute: "chat-settings" },
  ],
  panels: [
    { id: "chat.panel", title: "和宠物聊天", rendererRoute: "chat-panel" },
  ],
  capabilities: ["model:text", "pet:behavior"],
};