import type {
  PetdexPluginManifest,
  PluginContributions,
  PluginInfoContribution,
  PluginMenuItem,
  PluginPanelContribution,
  PluginSettingsSection,
  PluginShortcutContribution,
} from "../../shared/pluginTypes.js";

export interface PluginRegistry {
  getEnabledPlugins(): PetdexPluginManifest[];
  getMenuItems(): PluginMenuItem[];
  getShortcuts(): PluginShortcutContribution[];
  getSettingsSections(): PluginSettingsSection[];
  getPanels(): PluginPanelContribution[];
  getPluginInfo(): PluginInfoContribution[];
  getContributions(): PluginContributions;
  findAction(action: string): { pluginId: string; item: PluginMenuItem } | undefined;
  updateEnabledPlugins(enabledPlugins: Record<string, boolean>): void;
}

function selectEnabledPlugins(
  manifests: PetdexPluginManifest[],
  enabledPlugins: Record<string, boolean>,
): PetdexPluginManifest[] {
  return manifests.filter((manifest) => enabledPlugins[manifest.id] !== false);
}

export function createPluginRegistry(
  manifests: PetdexPluginManifest[],
  enabledPlugins: Record<string, boolean>,
): PluginRegistry {
  let enabledPluginConfig = { ...enabledPlugins };
  let enabled = selectEnabledPlugins(manifests, enabledPluginConfig);

  function getMenuItems() {
    return enabled.flatMap((manifest) => manifest.menuItems);
  }

  function getShortcuts() {
    return enabled.flatMap((manifest) => manifest.shortcuts ?? []);
  }

  function getSettingsSections() {
    return enabled.flatMap((manifest) => manifest.settingsSections ?? []);
  }

  function getPanels() {
    return enabled.flatMap((manifest) => manifest.panels ?? []);
  }

  function getPluginInfo() {
    return manifests.map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled: enabledPluginConfig[manifest.id] !== false,
      capabilities: [...manifest.capabilities],
    }));
  }

  return {
    getEnabledPlugins() {
      return [...enabled];
    },
    getMenuItems,
    getShortcuts,
    getSettingsSections,
    getPanels,
    getPluginInfo,
    getContributions() {
      return {
        menuItems: getMenuItems(),
        shortcuts: getShortcuts(),
        settingsSections: getSettingsSections(),
        panels: getPanels(),
        plugins: getPluginInfo(),
      };
    },
    findAction(action) {
      for (const manifest of enabled) {
        const item = manifest.menuItems.find((entry: PluginMenuItem) => entry.action === action);
        if (item) {
          return { pluginId: manifest.id, item };
        }
      }

      return undefined;
    },
    updateEnabledPlugins(nextEnabledPlugins) {
      enabledPluginConfig = { ...nextEnabledPlugins };
      enabled = selectEnabledPlugins(manifests, enabledPluginConfig);
    },
  };
}