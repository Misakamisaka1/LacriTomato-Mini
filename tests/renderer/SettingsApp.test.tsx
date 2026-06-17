import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../src/renderer/shell/SettingsApp";
import { defaultAppConfig } from "../../src/shared/configSchema";

describe("SettingsApp", () => {
  beforeEach(() => {
    window.petdex = {
      config: {
        get: vi.fn().mockResolvedValue(defaultAppConfig),
        set: vi.fn(),
        setApiKey: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn(),
      },
    };
  });

  it("shows model and shortcut defaults", async () => {
    render(<SettingsApp />);
    expect(await screen.findByDisplayValue("deepseek-flash")).toBeTruthy();
    expect(await screen.findByDisplayValue("CommandOrControl+Shift+A")).toBeTruthy();
  });
});
