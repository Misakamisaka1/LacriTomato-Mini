export interface ShortcutKeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export type ShortcutCaptureResult =
  | { status: "captured"; accelerator: string }
  | { status: "pending"; message: string }
  | { status: "invalid"; message: string };

const modifierAliases = new Map<string, "CommandOrControl" | "Alt" | "Shift">([
  ["cmd", "CommandOrControl"],
  ["command", "CommandOrControl"],
  ["commandorcontrol", "CommandOrControl"],
  ["control", "CommandOrControl"],
  ["ctrl", "CommandOrControl"],
  ["meta", "CommandOrControl"],
  ["super", "CommandOrControl"],
  ["win", "CommandOrControl"],
  ["windows", "CommandOrControl"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"],
]);

const keyAliases = new Map<string, string>([
  [" ", "Space"],
  ["space", "Space"],
  ["spacebar", "Space"],
  ["escape", "Esc"],
  ["esc", "Esc"],
  ["arrowup", "Up"],
  ["up", "Up"],
  ["arrowdown", "Down"],
  ["down", "Down"],
  ["arrowleft", "Left"],
  ["left", "Left"],
  ["arrowright", "Right"],
  ["right", "Right"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["tab", "Tab"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["del", "Delete"],
  ["insert", "Insert"],
  ["ins", "Insert"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
  ["+", "Plus"],
  ["plus", "Plus"],
  ["-", "Minus"],
  ["minus", "Minus"],
]);

function normalizeModifier(token: string) {
  return modifierAliases.get(token.trim().toLowerCase());
}

function normalizeMainKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (modifierAliases.has(lower)) {
    return undefined;
  }

  const alias = keyAliases.get(lower);
  if (alias) {
    return alias;
  }

  if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^[a-z0-9]$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return undefined;
}

function uniqueModifiers(modifiers: string[]) {
  const set = new Set(modifiers);
  return ["CommandOrControl", "Alt", "Shift"].filter((modifier) => set.has(modifier));
}

export function normalizeShortcutAccelerator(value: string): string | undefined {
  const tokens = value.split("+").map((token) => token.trim()).filter(Boolean);
  const modifiers: string[] = [];
  let mainKey: string | undefined;

  for (const token of tokens) {
    const modifier = normalizeModifier(token);
    if (modifier) {
      modifiers.push(modifier);
      continue;
    }

    const key = normalizeMainKey(token);
    if (!key || mainKey) {
      return undefined;
    }

    mainKey = key;
  }

  if (!mainKey) {
    return undefined;
  }

  const normalized = [...uniqueModifiers(modifiers), mainKey];
  if (normalized.length < 2 || normalized.length > 3) {
    return undefined;
  }

  return normalized.join("+");
}

export function captureShortcutAccelerator(event: ShortcutKeyLike): ShortcutCaptureResult {
  const modifiers = uniqueModifiers([
    event.ctrlKey || event.metaKey ? "CommandOrControl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean));
  const mainKey = normalizeMainKey(event.key);

  if (!mainKey) {
    return {
      status: "pending",
      message: "请继续按一个普通按键",
    };
  }

  const tokens = [...modifiers, mainKey];
  if (tokens.length < 2) {
    return {
      status: "invalid",
      message: "快捷键至少需要 2 个按键",
    };
  }

  if (tokens.length > 3) {
    return {
      status: "invalid",
      message: "快捷键最多支持 3 个按键",
    };
  }

  return {
    status: "captured",
    accelerator: tokens.join("+"),
  };
}
