import { describe, expect, it, vi } from "vitest";
import { registerAppShortcuts } from "../../src/main/services/appShortcuts";
import { defaultAppConfig } from "../../src/shared/configSchema";

function createHandlers() {
  return {
    captureArea: vi.fn(),
    openTranslator: vi.fn(),
    quickTranslateSelection: vi.fn(),
    togglePet: vi.fn(),
    toggleRecording: vi.fn(),
  };
}

describe("app shortcut registration", () => {
  it("registers every active app shortcut from config", () => {
    const service = {
      register: vi.fn().mockReturnValue(true),
      unregisterAll: vi.fn(),
    };
    const handlers = createHandlers();

    const results = registerAppShortcuts(service, defaultAppConfig.shortcuts, handlers);

    expect(service.unregisterAll).toHaveBeenCalledTimes(1);
    expect(service.register).toHaveBeenCalledTimes(5);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+A", handlers.captureArea);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+T", handlers.openTranslator);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+Y", handlers.quickTranslateSelection);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+P", handlers.togglePet);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+R", handlers.toggleRecording);
    expect(results.every((result) => result.registered)).toBe(true);
  });

  it("reports failed registrations without stopping later shortcuts", () => {
    const occupied = new Set([
      "CommandOrControl+Shift+A",
      "CommandOrControl+Alt+A",
      "CommandOrControl+Shift+S",
    ]);
    const service = {
      register: vi.fn((accelerator: string) => !occupied.has(accelerator)),
      unregisterAll: vi.fn(),
    };
    const handlers = createHandlers();

    const results = registerAppShortcuts(service, defaultAppConfig.shortcuts, handlers);

    expect(results[0]).toEqual({ id: "captureArea", accelerator: "CommandOrControl+Shift+A", registered: false });
    expect(results.slice(1).every((result) => result.registered)).toBe(true);
  });

  it("uses a fallback accelerator when the configured screenshot shortcut is occupied", () => {
    const service = {
      register: vi.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValue(true),
      unregisterAll: vi.fn(),
    };
    const handlers = createHandlers();

    const results = registerAppShortcuts(service, defaultAppConfig.shortcuts, handlers);

    expect(service.register).toHaveBeenNthCalledWith(1, "CommandOrControl+Shift+A", handlers.captureArea);
    expect(service.register).toHaveBeenNthCalledWith(2, "CommandOrControl+Alt+A", handlers.captureArea);
    expect(results[0]).toEqual({
      id: "captureArea",
      accelerator: "CommandOrControl+Shift+A",
      registeredAccelerator: "CommandOrControl+Alt+A",
      registered: true,
      fallbackUsed: true,
    });
  });

  it("registers only shortcuts contributed by enabled plugins plus the core pet toggle", () => {
    const service = {
      register: vi.fn().mockReturnValue(true),
      unregisterAll: vi.fn(),
    };
    const handlers = createHandlers();

    const results = registerAppShortcuts(
      service,
      defaultAppConfig.shortcuts,
      handlers,
      ["captureArea", "toggleRecording", "togglePet"],
    );

    expect(service.register).toHaveBeenCalledTimes(3);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+A", handlers.captureArea);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+R", handlers.toggleRecording);
    expect(service.register).toHaveBeenCalledWith("CommandOrControl+Shift+P", handlers.togglePet);
    expect(results.map((result) => result.id)).toEqual(["captureArea", "togglePet", "toggleRecording"]);
  });
});