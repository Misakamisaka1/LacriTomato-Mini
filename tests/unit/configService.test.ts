import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConfigService } from "../../src/main/services/configService";

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("config service", () => {
  it("writes default config on first load", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    const service = createConfigService({ userDataPath: dir });

    const config = service.getConfig();

    expect(config.pet.defaultHeight).toBe(224);
    expect(readFileSync(join(dir, "config.json"), "utf8")).toContain("deepseek-flash");
  });

  it("merges persisted config with defaults", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    const service = createConfigService({ userDataPath: dir });

    service.setConfig({ pet: { defaultHeight: 192 } });

    expect(service.getConfig().pet.defaultHeight).toBe(192);
    expect(service.getConfig().shortcuts.captureArea).toBe("CommandOrControl+Shift+A");
  });
});
