import { describe, expect, it } from "vitest";
import { captureShortcutAccelerator, normalizeShortcutAccelerator } from "../../src/shared/shortcutAccelerator";

describe("shortcut accelerator helpers", () => {
  it("captures a two-key shortcut from a keyboard event", () => {
    expect(captureShortcutAccelerator({ key: "a", ctrlKey: true })).toEqual({
      status: "captured",
      accelerator: "CommandOrControl+A",
    });
  });

  it("captures a three-key shortcut from a keyboard event", () => {
    expect(captureShortcutAccelerator({ key: "T", ctrlKey: true, shiftKey: true })).toEqual({
      status: "captured",
      accelerator: "CommandOrControl+Shift+T",
    });
  });

  it("keeps recording while only modifier keys are pressed", () => {
    expect(captureShortcutAccelerator({ key: "Control", ctrlKey: true })).toEqual({
      status: "pending",
      message: "请继续按一个普通按键",
    });
  });

  it("rejects shortcuts shorter than two keys", () => {
    expect(captureShortcutAccelerator({ key: "A" })).toEqual({
      status: "invalid",
      message: "快捷键至少需要 2 个按键",
    });
  });

  it("rejects shortcuts longer than three keys", () => {
    expect(captureShortcutAccelerator({ key: "S", ctrlKey: true, altKey: true, shiftKey: true })).toEqual({
      status: "invalid",
      message: "快捷键最多支持 3 个按键",
    });
  });

  it("normalizes stored shortcut text before registering with Electron", () => {
    expect(normalizeShortcutAccelerator("ctrl + shift + t")).toBe("CommandOrControl+Shift+T");
  });
});
