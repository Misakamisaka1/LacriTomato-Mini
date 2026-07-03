import { globalShortcut } from "electron";
import { normalizeShortcutAccelerator } from "../../shared/shortcutAccelerator.js";

export interface ShortcutService {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export function createShortcutService(): ShortcutService {
  return {
    register(accelerator, callback) {
      const normalized = normalizeShortcutAccelerator(accelerator);
      if (!normalized) {
        return false;
      }

      return globalShortcut.register(normalized, callback);
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
  };
}
