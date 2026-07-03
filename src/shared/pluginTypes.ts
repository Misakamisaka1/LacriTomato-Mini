export type PluginCapability =
  | "model:text"
  | "model:vision"
  | "screen:capture"
  | "screen:record"
  | "audio:system-loopback"
  | "audio:microphone"
  | "clipboard:text"
  | "clipboard:image"
  | "file:save"
  | "ocr:local"
  | "pet:behavior";

export interface PluginMenuItem {
  id: string;
  label: string;
  action: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
}

export interface PluginShortcutContribution {
  id: string;
  label: string;
  defaultAccelerator: string;
}

export interface PluginSettingsSection {
  id: string;
  label: string;
  rendererRoute: string;
}

export interface PluginPanelContribution {
  id: string;
  title: string;
  rendererRoute: string;
}

export interface PluginInfoContribution {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  capabilities: PluginCapability[];
}

export interface PluginContributions {
  menuItems: PluginMenuItem[];
  shortcuts: PluginShortcutContribution[];
  settingsSections: PluginSettingsSection[];
  panels: PluginPanelContribution[];
  plugins: PluginInfoContribution[];
}

export interface PetdexPluginManifest {
  id: string;
  name: string;
  version: string;
  menuItems: PluginMenuItem[];
  shortcuts?: PluginShortcutContribution[];
  settingsSections?: PluginSettingsSection[];
  panels?: PluginPanelContribution[];
  capabilities: PluginCapability[];
}