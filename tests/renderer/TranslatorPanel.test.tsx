import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPanel } from "../../src/plugins/translator/renderer/TranslatorPanel";

describe("TranslatorPanel", () => {
  beforeEach(() => {
    window.petdex = {
      config: {
        get: vi.fn(),
        set: vi.fn(),
        setApiKey: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn().mockResolvedValue({
          results: [{ language: "en", text: "Hello" }],
        }),
      },
    };
  });

  it("translates pasted text", async () => {
    render(<TranslatorPanel />);
    fireEvent.change(screen.getByLabelText("输入文本"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(await screen.findByText("Hello")).toBeTruthy();
  });
});
