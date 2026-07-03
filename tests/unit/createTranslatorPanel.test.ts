import { describe, expect, it, vi } from "vitest";
import { createTranslatorPanel } from "../../src/main/windows/createTranslatorPanel";

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: {
      width?: number;
      height?: number;
      minWidth?: number;
      minHeight?: number;
    };
    loadFile: ReturnType<typeof vi.fn>;
  }> = [];

  const BrowserWindow = vi.fn((options: typeof instances[number]["options"]) => {
    const window = {
      options,
      loadFile: vi.fn(),
    };
    instances.push(window);
    return window;
  });

  return { BrowserWindow, instances };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
}));

describe("createTranslatorPanel", () => {
  it("opens the translator large enough to show the input area without scrolling", () => {
    createTranslatorPanel("preload.js");

    expect(electronMock.instances[0].options).toMatchObject({
      width: 980,
      height: 720,
      minWidth: 900,
      minHeight: 680,
    });
  });
});