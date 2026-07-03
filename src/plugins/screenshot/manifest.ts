import type { PetdexPluginManifest } from "../../shared/pluginTypes.js";

export const screenshotManifest: PetdexPluginManifest = {
  id: "screenshot",
  name: "截图",
  version: "0.1.0",
  menuItems: [
    { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
  ],
  shortcuts: [
    { id: "captureArea", label: "截图", defaultAccelerator: "CommandOrControl+Shift+A" },
  ],
  settingsSections: [
    { id: "screenshot.settings", label: "截图", rendererRoute: "screenshot-settings" },
    { id: "ocr.settings", label: "OCR", rendererRoute: "ocr-settings" },
  ],
  panels: [
    { id: "screenshot.overlay", title: "截图", rendererRoute: "screenshot-overlay" },
  ],
  capabilities: ["screen:capture", "clipboard:image", "file:save", "ocr:local"],
};