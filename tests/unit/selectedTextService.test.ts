import { describe, expect, it, vi } from "vitest";
import { createSelectedTextService } from "../../src/main/services/selectedTextService";

describe("selected text service", () => {
  it("copies the active selection and restores the previous clipboard text", async () => {
    let clipboardText = "previous clipboard";
    const clipboard = {
      readText: vi.fn(() => clipboardText),
      writeText: vi.fn((text: string) => {
        clipboardText = text;
      }),
      clear: vi.fn(() => {
        clipboardText = "";
      }),
    };
    const sendCopyShortcut = vi.fn(() => {
      clipboardText = "selected text";
    });
    const wait = vi.fn(async () => undefined);
    const service = createSelectedTextService({ clipboard, sendCopyShortcut, wait });

    const selectedText = await service.readSelectedText();

    expect(selectedText).toBe("selected text");
    expect(sendCopyShortcut).toHaveBeenCalledTimes(1);
    expect(clipboard.writeText).toHaveBeenLastCalledWith("previous clipboard");
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when copying does not produce text", async () => {
    let clipboardText = "previous clipboard";
    const clipboard = {
      readText: vi.fn(() => clipboardText),
      writeText: vi.fn((text: string) => {
        clipboardText = text;
      }),
      clear: vi.fn(() => {
        clipboardText = "";
      }),
    };
    const service = createSelectedTextService({
      clipboard,
      sendCopyShortcut: vi.fn(),
      wait: vi.fn(async () => undefined),
    });

    await expect(service.readSelectedText()).resolves.toBeUndefined();
    expect(clipboard.writeText).toHaveBeenLastCalledWith("previous clipboard");
  });

  it("waits for delayed clipboard text after sending the copy shortcut", async () => {
    let clipboardText = "previous clipboard";
    let copyRequested = false;
    let waitsAfterCopy = 0;
    const clipboard = {
      readText: vi.fn(() => clipboardText),
      writeText: vi.fn((text: string) => {
        clipboardText = text;
      }),
      clear: vi.fn(() => {
        clipboardText = "";
      }),
    };
    const sendCopyShortcut = vi.fn(() => {
      copyRequested = true;
    });
    const wait = vi.fn(async () => {
      if (!copyRequested) {
        return;
      }

      waitsAfterCopy += 1;
      if (waitsAfterCopy === 2) {
        clipboardText = "delayed selected text";
      }
    });
    const service = createSelectedTextService({ clipboard, sendCopyShortcut, wait });

    const selectedText = await service.readSelectedText();

    expect(selectedText).toBe("delayed selected text");
    expect(clipboard.writeText).toHaveBeenLastCalledWith("previous clipboard");
  });
});
