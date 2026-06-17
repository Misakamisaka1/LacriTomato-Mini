import { describe, expect, it } from "vitest";
import { appConfigSchema, defaultAppConfig } from "../../src/shared/configSchema";

describe("config schema", () => {
  it("accepts default app config", () => {
    expect(() => appConfigSchema.parse(defaultAppConfig)).not.toThrow();
  });

  it("uses recommended shortcut defaults", () => {
    expect(defaultAppConfig.shortcuts.captureArea).toBe("CommandOrControl+Shift+A");
    expect(defaultAppConfig.shortcuts.captureOcr).toBe("CommandOrControl+Shift+O");
  });

  it("uses accepted pet default size", () => {
    expect(defaultAppConfig.pet.defaultHeight).toBe(224);
  });
});
