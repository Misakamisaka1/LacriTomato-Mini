import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPetVitalsService } from "../../src/main/services/petVitalsService";
import { defaultAppConfig, type AppConfig } from "../../src/shared/configSchema";
import { createInitialPetVitals } from "../../src/shared/petVitals";

const hourMs = 60 * 60 * 1000;
const startMs = 1_700_000_000_000;

let dir: string | undefined;
let clock = startMs;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }

  clock = startMs;
});

function makeDir() {
  dir = mkdtempSync(join(tmpdir(), "petdex-vitals-"));
  return dir;
}

function makeConfig(patch: Partial<AppConfig["vitals"]> = {}): AppConfig {
  return {
    ...defaultAppConfig,
    vitals: { ...defaultAppConfig.vitals, ...patch },
  };
}

function createService(config: AppConfig = makeConfig()) {
  return createPetVitalsService({
    userDataPath: makeDir(),
    getConfig: () => config,
    now: () => clock,
  });
}

describe("pet vitals service", () => {
  it("persists the state to disk when an action succeeds", () => {
    const config = makeConfig();
    const service = createService(config);

    const result = service.applyAction("feed");

    expect(result.ok).toBe(true);
    const persisted = JSON.parse(readFileSync(join(dir as string, "pet-vitals.json"), "utf8")) as {
      version: number;
      state: { satiety: number; totals: { feed: number } };
    };
    expect(persisted.version).toBe(1);
    expect(persisted.state.satiety).toBe(result.snapshot.stats.satiety);
    expect(persisted.state.totals.feed).toBe(1);
  });

  it("applies offline decay when the app starts again", () => {
    const config = makeConfig();
    const first = createService(config);
    first.applyAction("feed");
    const fedSatiety = first.getSnapshot().stats.satiety;
    first.stop();

    clock = startMs + 10 * hourMs;
    const second = createPetVitalsService({
      userDataPath: dir as string,
      getConfig: () => config,
      now: () => clock,
    });

    expect(second.getSnapshot().stats.satiety).toBeCloseTo(fedSatiety - 4.2 * 10, 1);
  });

  it("never decays while the vitals system is disabled", () => {
    const config = makeConfig({ enabled: false });
    const service = createService(config);
    const before = service.getSnapshot().stats.satiety;

    clock = startMs + 20 * hourMs;

    expect(service.getSnapshot().stats.satiety).toBe(before);
    expect(service.getSnapshot().paused).toBe(true);
  });

  it("notifies once when the pet starts starving", () => {
    const config = makeConfig();
    const service = createService(config);
    const onNeed = vi.fn();
    service.onNeed(onNeed);
    const hungryCalls = () => onNeed.mock.calls.filter(([need]) => need.kind === "hungry").length;

    clock = startMs + 14 * hourMs;
    service.getSnapshot();
    service.getSnapshot();

    expect(hungryCalls()).toBe(1);
    expect(onNeed.mock.calls[0][0]).toMatchObject({ kind: "hungry" });

    // Feeding the pet clears the flag so a later hunger spike is reported again.
    service.applyAction("feed");
    clock = startMs + 40 * hourMs;
    service.getSnapshot();

    expect(hungryCalls()).toBe(2);
  });

  it("stays quiet when care notifications are turned off", () => {
    const config = makeConfig({ notifications: false });
    const service = createService(config);
    const onNeed = vi.fn();
    service.onNeed(onNeed);

    clock = startMs + 30 * hourMs;
    service.getSnapshot();

    expect(onNeed).not.toHaveBeenCalled();
  });

  it("broadcasts snapshots on change and resets on demand", () => {
    const service = createService();
    const onChanged = vi.fn();
    service.onChanged(onChanged);

    service.applyAction("pet");
    expect(onChanged).toHaveBeenCalled();
    expect(service.getState().totals.pet).toBe(1);

    const snapshot = service.reset();

    expect(snapshot.points).toBe(0);
    expect(snapshot.totals.pet).toBe(0);
    expect(snapshot.stats.satiety).toBe(createInitialPetVitals(startMs).satiety);
    expect(service.getState().cooldownUntilMs).toEqual({});
  });

  it("writes a state file on start and survives a corrupted file", () => {
    const config = makeConfig();
    const service = createService(config);
    service.start();
    service.stop();

    expect(existsSync(join(dir as string, "pet-vitals.json"))).toBe(true);
  });

  it("falls back to a fresh pet when the persisted file is broken", () => {
    const config = makeConfig();
    dir = mkdtempSync(join(tmpdir(), "petdex-vitals-"));
    const file = join(dir, "pet-vitals.json");
    writeFileSync(file, "{ not json", "utf8");

    const service = createPetVitalsService({
      userDataPath: dir,
      getConfig: () => config,
      now: () => clock,
    });

    expect(service.getSnapshot().stats.satiety).toBe(createInitialPetVitals(startMs).satiety);
  });
});