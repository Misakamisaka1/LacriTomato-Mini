export type PluginCapability =
  | "model:text"
  | "model:vision"
  | "screen:capture"
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
