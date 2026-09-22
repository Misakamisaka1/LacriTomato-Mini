import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../../shared/configSchema.js";
import {
  applyPetVitalsAction,
  createInitialPetVitals,
  createPetVitalsSnapshot,
  decayPetVitals,
  getPetVitalsNeedEvent,
  isPetVitalsNeedCleared,
  normalizePetVitalsState,
  petVitalsActionCatalog,
  type PetVitalsActionId,
  type PetVitalsActionResult,
  type PetVitalsDecayRates,
  type PetVitalsNeedEvent,
  type PetVitalsNeedKind,
  type PetVitalsSnapshot,
  type PetVitalsState,
} from "../../shared/petVitals.js";

export interface PetVitalsServiceOptions {
  userDataPath: string;
  getConfig(): AppConfig;
  now?(): number;
  /** Decay/notification heartbeat. Defaults to 30 seconds. */
  tickMs?: number;
  /** Minimum disk write interval while only decay happened. Defaults to 60 seconds. */
  persistIntervalMs?: number;
}

export interface PetVitalsService {
  getState(): PetVitalsState;
  getSnapshot(): PetVitalsSnapshot;
  applyAction(action: PetVitalsActionId): PetVitalsActionResult;
  reset(): PetVitalsSnapshot;
  start(): void;
  stop(): void;
  onChanged(callback: (snapshot: PetVitalsSnapshot) => void): () => void;
  onNeed(callback: (need: PetVitalsNeedEvent) => void): () => void;
}

const defaultTickMs = 30_000;
const defaultPersistIntervalMs = 60_000;
const needQuietMs = 10 * 60 * 1000;
const needKinds: PetVitalsNeedKind[] = ["hungry", "bored", "lonely"];

interface PersistedPetVitals {
  version: 1;
  state: PetVitalsState;
}

function readDecayRates(config: AppConfig): PetVitalsDecayRates {
  return {
    satietyPerHour: config.vitals.satietyDecayPerHour,
    moodPerHour: config.vitals.moodDecayPerHour,
    affinityPerHour: config.vitals.affinityDecayPerHour,
  };
}

export function createPetVitalsService(options: PetVitalsServiceOptions): PetVitalsService {
  const now = options.now ?? (() => Date.now());
  const tickMs = options.tickMs ?? defaultTickMs;
  const persistIntervalMs = options.persistIntervalMs ?? defaultPersistIntervalMs;
  const vitalsPath = join(options.userDataPath, "pet-vitals.json");
  mkdirSync(options.userDataPath, { recursive: true });

  const changeListeners = new Set<(snapshot: PetVitalsSnapshot) => void>();
  const needListeners = new Set<(need: PetVitalsNeedEvent) => void>();
  const flaggedNeeds = new Set<PetVitalsNeedKind>();
  const lastNeedAtMs = new Map<PetVitalsNeedKind, number>();

  let timer: ReturnType<typeof setInterval> | undefined;
  let lastPersistedAtMs = 0;
  let state = loadState();

  function loadState(): PetVitalsState {
    if (!existsSync(vitalsPath)) {
      return createInitialPetVitals(now());
    }

    try {
      const parsed = JSON.parse(readFileSync(vitalsPath, "utf8")) as Partial<PersistedPetVitals> | PetVitalsState;
      const raw = parsed && typeof parsed === "object" && "state" in parsed
        ? (parsed as Partial<PersistedPetVitals>).state
        : parsed as PetVitalsState;

      if (!raw || typeof raw !== "object") {
        return createInitialPetVitals(now());
      }

      const normalized = normalizePetVitalsState({ ...createInitialPetVitals(now()), ...raw }, now());
      // Offline decay, so the pet is a little hungry after a restart too.
      return decayPetVitals(normalized, now(), readDecayRates(options.getConfig()));
    } catch {
      return createInitialPetVitals(now());
    }
  }

  function persist(force: boolean) {
    const currentNow = now();
    if (!force && currentNow - lastPersistedAtMs < persistIntervalMs) {
      return;
    }

    lastPersistedAtMs = currentNow;
    const payload: PersistedPetVitals = { version: 1, state };
    try {
      writeFileSync(vitalsPath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // A failed write must never take the pet down; the next tick retries.
    }
  }

  function snapshot(): PetVitalsSnapshot {
    const config = options.getConfig();
    return createPetVitalsSnapshot(state, now(), {
      enabled: config.vitals.enabled,
      hudMode: config.vitals.hudMode,
    });
  }

  function emitChanged() {
    const next = snapshot();
    changeListeners.forEach((listener) => listener(next));
  }

  function emitNeeds() {
    const config = options.getConfig();
    const stats = {
      affinity: state.affinity,
      satiety: state.satiety,
      mood: state.mood,
    };

    for (const kind of needKinds) {
      if (isPetVitalsNeedCleared(stats, kind)) {
        flaggedNeeds.delete(kind);
        continue;
      }

      const need = getPetVitalsNeedEvent(stats, kind);
      if (!need || flaggedNeeds.has(kind)) {
        continue;
      }

      if (!config.vitals.enabled || !config.vitals.notifications) {
        // Remember the condition so it is not replayed the moment it is enabled.
        flaggedNeeds.add(kind);
        continue;
      }

      const currentNow = now();
      const previousAt = lastNeedAtMs.get(kind) ?? Number.NEGATIVE_INFINITY;
      if (currentNow - previousAt < needQuietMs) {
        continue;
      }

      flaggedNeeds.add(kind);
      lastNeedAtMs.set(kind, currentNow);
      needListeners.forEach((listener) => listener(need));
    }
  }

  function refresh() {
    const currentNow = now();
    const config = options.getConfig();

    if (config.vitals.enabled) {
      const decayed = decayPetVitals(state, currentNow, readDecayRates(config));
      const changed = decayed.satiety !== state.satiety
        || decayed.mood !== state.mood
        || decayed.affinity !== state.affinity;

      state = decayed;
      if (changed) {
        persist(false);
        emitChanged();
      }
    }

    emitNeeds();
  }

  function tick() {
    refresh();
  }

  return {
    getState() {
      return state;
    },
    getSnapshot() {
      refresh();
      return snapshot();
    },
    applyAction(action) {
      const config = options.getConfig();
      if (!petVitalsActionCatalog[action]) {
        throw new Error(`未知的养成操作：${action}`);
      }

      const { state: nextState, result } = applyPetVitalsAction(state, action, now(), {
        rates: readDecayRates(config),
      });
      const stateChanged = nextState !== state;
      state = nextState;

      if (result.ok || stateChanged) {
        persist(true);
        emitChanged();
      }

      emitNeeds();

      return { ...result, snapshot: snapshot() };
    },
    reset() {
      state = createInitialPetVitals(now());
      flaggedNeeds.clear();
      lastNeedAtMs.clear();
      persist(true);
      emitChanged();
      return snapshot();
    },
    start() {
      if (timer) {
        return;
      }

      timer = setInterval(tick, tickMs);
      refresh();
    },
    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
      persist(true);
    },
    onChanged(callback) {
      changeListeners.add(callback);
      return () => changeListeners.delete(callback);
    },
    onNeed(callback) {
      needListeners.add(callback);
      return () => needListeners.delete(callback);
    },
  };
}