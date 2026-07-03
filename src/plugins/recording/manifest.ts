import type { PetdexPluginManifest } from "../../shared/pluginTypes.js";

export const recordingManifest: PetdexPluginManifest = {
  id: "recording",
  name: "录屏",
  version: "0.1.0",
  menuItems: [
    { id: "recording.toggle", label: "录屏", action: "recording.toggle", icon: "Video" },
  ],
  shortcuts: [
    { id: "toggleRecording", label: "录屏", defaultAccelerator: "CommandOrControl+Shift+R" },
  ],
  settingsSections: [
    { id: "recording.settings", label: "录屏", rendererRoute: "recording-settings" },
  ],
  capabilities: ["screen:record", "audio:system-loopback", "audio:microphone", "file:save"],
};