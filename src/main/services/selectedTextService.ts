import { execFile } from "node:child_process";
import { clipboard } from "electron";

export interface TextClipboardAdapter {
  readText(): string;
  writeText(text: string): void;
  clear(): void;
}

export interface SelectedTextService {
  readSelectedText(): Promise<string | undefined>;
}

export interface SelectedTextServiceOptions {
  clipboard?: TextClipboardAdapter;
  sendCopyShortcut?: () => Promise<void> | void;
  wait?: (ms: number) => Promise<void>;
  beforeCopyDelayMs?: number;
  afterCopyDelayMs?: number;
  clipboardPollIntervalMs?: number;
  copyTimeoutMs?: number;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sendWindowsCopyShortcut() {
  return new Promise<void>((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("快速翻译选中文本目前仅支持 Windows。"));
      return;
    }

    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')",
      ],
      { windowsHide: true },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

export function createSelectedTextService(options: SelectedTextServiceOptions = {}): SelectedTextService {
  const textClipboard = options.clipboard ?? clipboard;
  const sendCopyShortcut = options.sendCopyShortcut ?? sendWindowsCopyShortcut;
  const wait = options.wait ?? sleep;
  const beforeCopyDelayMs = options.beforeCopyDelayMs ?? 90;
  const afterCopyDelayMs = options.afterCopyDelayMs ?? 160;
  const clipboardPollIntervalMs = Math.max(10, options.clipboardPollIntervalMs ?? 60);
  const copyTimeoutMs = Math.max(afterCopyDelayMs, options.copyTimeoutMs ?? 900);

  async function readClipboardTextUntilAvailable() {
    await wait(afterCopyDelayMs);

    const initialText = textClipboard.readText().trim();
    if (initialText) {
      return initialText;
    }

    const remainingPollTimeMs = Math.max(0, copyTimeoutMs - afterCopyDelayMs);
    const maxAttempts = Math.max(1, Math.ceil(remainingPollTimeMs / clipboardPollIntervalMs));
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await wait(clipboardPollIntervalMs);
      const nextText = textClipboard.readText().trim();
      if (nextText) {
        return nextText;
      }
    }

    return undefined;
  }

  return {
    async readSelectedText() {
      const previousText = textClipboard.readText();

      textClipboard.clear();
      await wait(beforeCopyDelayMs);
      await sendCopyShortcut();
      const selectedText = await readClipboardTextUntilAvailable();
      textClipboard.writeText(previousText);

      return selectedText;
    },
  };
}
