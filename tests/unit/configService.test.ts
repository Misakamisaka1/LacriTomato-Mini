import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    expect(config.model.model).toBe("deepseek-v4-flash");
    expect(config.recording.qualityPreset).toBe("1080p");
    expect(readFileSync(join(dir, "config.json"), "utf8")).toContain("deepseek-v4-flash");
  });

  it("merges persisted config with defaults", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    const service = createConfigService({ userDataPath: dir });

    service.setConfig({ pet: { defaultHeight: 192 } });

    expect(service.getConfig().pet.defaultHeight).toBe(192);
    expect(service.getConfig().shortcuts.captureArea).toBe("CommandOrControl+Shift+A");
    expect(service.getConfig().shortcuts.toggleRecording).toBe("CommandOrControl+Shift+R");
  });

  it("merges old persisted config with recording defaults", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({
      plugins: { translator: true, screenshot: true, chat: true },
      shortcuts: { captureArea: "CommandOrControl+Alt+A" },
    }), "utf8");

    const service = createConfigService({ userDataPath: dir });

    expect(service.getConfig().recording).toEqual(expect.objectContaining({
      saveDirectoryName: "recordings",
      recordSystemAudio: true,
      audioMode: "mixed",
    }));
    expect(service.getConfig().plugins.recording).toBe(true);
    expect(service.getConfig().shortcuts.toggleRecording).toBe("CommandOrControl+Shift+R");
    expect(service.getConfig().pet.skinSourcePath).toBe("");
  });

  it("migrates the old DeepSeek flash model id to the current API model id", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({
      model: { model: "deepseek-flash" },
    }), "utf8");

    const service = createConfigService({ userDataPath: dir });

    expect(service.getConfig().model.model).toBe("deepseek-v4-flash");
  });

  it("drops a pre-click-mode pinned card position in favour of the on-demand default", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({
      vitals: { showHud: true, hudPosition: { x: 1800, y: 424 } },
    }), "utf8");

    const service = createConfigService({ userDataPath: dir });

    expect(service.getConfig().vitals.hudMode).toBe("click");
    expect(service.getConfig().vitals.hudPosition).toBeNull();
    // The stale pre-mode flag is gone from the rewritten file too.
    expect(readFileSync(join(dir, "config.json"), "utf8")).not.toContain("showHud");
  });

  it("keeps a pinned card position once a mode is stored", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({
      vitals: { hudMode: "always", hudPosition: { x: 1800, y: 424 } },
    }), "utf8");

    const service = createConfigService({ userDataPath: dir });

    expect(service.getConfig().vitals.hudMode).toBe("always");
    expect(service.getConfig().vitals.hudPosition).toEqual({ x: 1800, y: 424 });
  });
});
