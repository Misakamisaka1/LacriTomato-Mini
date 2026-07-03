import type { AppConfig } from "../../shared/configSchema.js";
import { normalizeShortcutAccelerator } from "../../shared/shortcutAccelerator.js";

export type AppShortcutId = keyof AppConfig["shortcuts"];

export interface ShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export interface AppShortcutHandlers {
  captureArea(): void;
  openTranslator(): void;
  quickTranslateSelection(): void;
  togglePet(): void;
  toggleRecording(): void;
}

export interface AppShortcutRegistrationResult {
  id: AppShortcutId;
  accelerator: string;
  registered: boolean;
  registeredAccelerator?: string;
  fallbackUsed?: boolean;
}

const fallbackAccelerators: Partial<Record<AppShortcutId, string[]>> = {
  captureArea: ["CommandOrControl+Alt+A", "CommandOrControl+Shift+S"],
  openTranslator: ["CommandOrControl+Alt+T"],
  quickTranslateSelection: ["CommandOrControl+Alt+Y"],
  togglePet: ["CommandOrControl+Alt+P"],
  toggleRecording: ["CommandOrControl+Alt+R"],
};

function uniqueFallbacks(id: AppShortcutId, primaryAccelerator: string) {
  const seen = new Set([primaryAccelerator]);

  return (fallbackAccelerators[id] ?? []).flatMap((fallback) => {
    const normalized = normalizeShortcutAccelerator(fallback);
    if (!normalized || seen.has(normalized)) {
      return [];
    }

    seen.add(normalized);
    return [normalized];
  });
}

function registerBinding(
  shortcutService: ShortcutRegistrar,
  binding: { id: AppShortcutId; accelerator: string; handler: () => void },
): AppShortcutRegistrationResult {
  const accelerator = normalizeShortcutAccelerator(binding.accelerator);
  if (!accelerator) {
    return {
      id: binding.id,
      accelerator: binding.accelerator,
      registered: false,
    };
  }

  const candidates = [accelerator, ...uniqueFallbacks(binding.id, accelerator)];
  for (const [index, candidate] of candidates.entries()) {
    if (!shortcutService.register(candidate, binding.handler)) {
      continue;
    }

    if (index === 0) {
      return {
        id: binding.id,
        accelerator,
        registered: true,
      };
    }

    return {
      id: binding.id,
      accelerator,
      registeredAccelerator: candidate,
      registered: true,
      fallbackUsed: true,
    };
  }

  return {
    id: binding.id,
    accelerator,
    registered: false,
  };
}

export function registerAppShortcuts(
  shortcutService: ShortcutRegistrar,
  shortcuts: AppConfig["shortcuts"],
  handlers: AppShortcutHandlers,
  activeShortcutIds?: AppShortcutId[],
): AppShortcutRegistrationResult[] {
  shortcutService.unregisterAll();

  const active = activeShortcutIds ? new Set(activeShortcutIds) : undefined;
  const allBindings: { id: AppShortcutId; accelerator: string; handler: () => void }[] = [
    { id: "captureArea", accelerator: shortcuts.captureArea, handler: handlers.captureArea },
    { id: "openTranslator", accelerator: shortcuts.openTranslator, handler: handlers.openTranslator },
    { id: "quickTranslateSelection", accelerator: shortcuts.quickTranslateSelection, handler: handlers.quickTranslateSelection },
    { id: "togglePet", accelerator: shortcuts.togglePet, handler: handlers.togglePet },
    { id: "toggleRecording", accelerator: shortcuts.toggleRecording, handler: handlers.toggleRecording },
  ];
  const bindings = allBindings.filter((binding) => !active || active.has(binding.id));

  return bindings.map((binding) => registerBinding(shortcutService, binding));
}
