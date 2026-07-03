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

  return {
    async readSelectedText() {
      const previousText = textClipboard.readText();

      textClipboard.clear();
      await wait(beforeCopyDelayMs);
      await sendCopyShortcut();
      await wait(afterCopyDelayMs);

      const selectedText = textClipboard.readText().trim();
      textClipboard.writeText(previousText);

      return selectedText || undefined;
    },
  };
}