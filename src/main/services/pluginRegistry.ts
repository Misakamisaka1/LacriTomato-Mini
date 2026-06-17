import type { PetdexPluginManifest, PluginMenuItem } from "../../shared/pluginTypes.js";

export interface PluginRegistry {
  getEnabledPlugins(): PetdexPluginManifest[];
  getMenuItems(): PluginMenuItem[];
  findAction(action: string): { pluginId: string; item: PluginMenuItem } | undefined;
}

export function createPluginRegistry(
  manifests: PetdexPluginManifest[],
  enabledPlugins: Record<string, boolean>,
): PluginRegistry {
  const enabled = manifests.filter((manifest) => enabledPlugins[manifest.id] !== false);

  return {
    getEnabledPlugins() {
      return [...enabled];
    },
    getMenuItems() {
      return enabled.flatMap((manifest) => manifest.menuItems);
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
  };
}
