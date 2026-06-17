import { globalShortcut } from "electron";

export interface ShortcutService {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export function createShortcutService(): ShortcutService {
  return {
    register(accelerator, callback) {
      return globalShortcut.register(accelerator, callback);
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
  };
}
