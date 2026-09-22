import { describe, expect, it } from "vitest";
import {
  applyPetVitalsAction,
  buildPetVitalsEffects,
  clampPetVitalsHudPosition,
  createInitialPetVitals,
  createPetVitalsSnapshot,
  decayPetVitals,
  defaultPetVitalsDecayRates,
  formatPetVitalsEffects,
  getPetBondLevel,
  getPetVitalsHudPlacement,
  getPetVitalsNeedEvent,
  getPetVitalsPanelSize,
  getPetVitalsTailOffset,
  getPetVitalsWarnings,
  isPetVitalsNeedCleared,
  maxOfflineDecayMs,
  normalizePetVitalsState,
  petVitalsPanelSizes,
} from "../../src/shared/petVitals";

const hourMs = 60 * 60 * 1000;
const startMs = 1_700_000_000_000;

describe("pet vitals decay", () => {
  it("drains satiety, mood and affinity by the configured hourly rates", () => {
    const state = createInitialPetVitals(startMs, { satiety: 80, mood: 60, affinity: 60 });
    const next = decayPetVitals(state, startMs + 5 * hourMs, defaultPetVitalsDecayRates);

    expect(next.satiety).toBeCloseTo(80 - 4.2 * 5, 5);
    // A full pet keeps its mood twice as long.
    expect(next.mood).toBeCloseTo(60 - 3 * 0.5 * 5, 5);
    expect(next.affinity).toBeCloseTo(60 - 0.6 * 5, 5);
    expect(next.lastUpdatedMs).toBe(startMs + 5 * hourMs);
  });

  it("drains mood faster while the pet is starving", () => {
    const state = createInitialPetVitals(startMs, { satiety: 10, mood: 60, affinity: 60 });
    const next = decayPetVitals(state, startMs + hourMs, defaultPetVitalsDecayRates);

    expect(next.mood).toBeCloseTo(60 - 3 * 2, 5);
    expect(next.affinity).toBeCloseTo(60 - 0.6 * 2, 5);
  });

  it("clamps values at zero and caps offline decay", () => {
    const state = createInitialPetVitals(startMs, { satiety: 100, mood: 100, affinity: 100, lastUpdatedMs: startMs });
    const next = decayPetVitals(state, startMs + 30 * 24 * hourMs, { satietyPerHour: 40, moodPerHour: 40, affinityPerHour: 40 });

    expect(next.satiety).toBe(0);
    expect(next.mood).toBe(0);
    expect(next.affinity).toBe(0);
    expect(maxOfflineDecayMs).toBe(72 * hourMs);
  });

  it("keeps values untouched when every rate is zero", () => {
    const state = createInitialPetVitals(startMs, { satiety: 42 });
    const next = decayPetVitals(state, startMs + 9 * hourMs, { satietyPerHour: 0, moodPerHour: 0, affinityPerHour: 0 });

    expect(next.satiety).toBe(42);
    expect(next.lastUpdatedMs).toBe(startMs + 9 * hourMs);
  });
});

describe("pet vitals actions", () => {
  it("feeds the pet, grants the daily first-interaction bonus and starts a cooldown", () => {
    const state = createInitialPetVitals(startMs, { satiety: 50, mood: 50, affinity: 50 });
    const { state: next, result } = applyPetVitalsAction(state, "feed", startMs);

    expect(result.ok).toBe(true);
    expect(next.satiety).toBe(76);
    expect(next.mood).toBe(55);
    expect(next.affinity).toBe(52);
    expect(next.points).toBe(6 + 8);
    expect(next.totals.feed).toBe(1);
    expect(next.cooldownUntilMs.feed).toBe(startMs + 45_000);
  });

  it("blocks a repeat action while it is cooling down", () => {
    const first = applyPetVitalsAction(createInitialPetVitals(startMs, { satiety: 40 }), "feed", startMs);
    const second = applyPetVitalsAction(first.state, "feed", startMs + 1000);

    expect(second.result.ok).toBe(false);
    expect(second.result.reason).toBe("cooldown");
    expect(second.result.message).toContain("冷却");
    expect(second.state.totals.feed).toBe(1);
  });

  it("refuses to overfeed a full pet", () => {
    const { result, state } = applyPetVitalsAction(createInitialPetVitals(startMs, { satiety: 96 }), "feed", startMs);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("requirement");
    expect(result.message).toContain("饱饱");
    expect(state.totals.feed).toBe(0);
  });

  it("refuses to play with a starving pet", () => {
    const { result } = applyPetVitalsAction(createInitialPetVitals(startMs, { satiety: 10, mood: 60 }), "play", startMs);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("requirement");
    expect(result.effects).toEqual([]);
  });

  it("spends satiety when playing and only rewards the daily bonus once per day", () => {
    const base = createInitialPetVitals(startMs, { satiety: 80, mood: 40, affinity: 40 });
    const first = applyPetVitalsAction(base, "play", startMs);
    const second = applyPetVitalsAction(first.state, "play", startMs + 31_000);

    expect(first.state.satiety).toBe(71);
    expect(first.state.points).toBe(12 + 8);
    expect(second.result.ok).toBe(true);
    expect(second.state.points).toBe(first.state.points + 12);
    expect(second.state.totals.play).toBe(2);
  });

  it("previews the effects that a card button will apply", () => {
    expect(formatPetVitalsEffects(buildPetVitalsEffects({
      id: "feed",
      label: "喂食",
      description: "",
      icon: "UtensilsCrossed",
      accent: "amber",
      cooldownMs: 1000,
      points: 6,
      effects: { affinity: 2, satiety: 26, mood: 5 },
      reaction: "",
      reactionEmotion: "happy",
      blockedReaction: "",
      blockedEmotion: "attentive",
    }))).toBe("好感度 +2 · 饱食度 +26 · 心情 +5 · 羁绊 +6");
  });
});

describe("pet vitals summaries", () => {
  it("maps lifetime points onto bond levels", () => {
    expect(getPetBondLevel(0)).toMatchObject({ level: 1, title: "初次相遇", nextLevelPoints: 120 });
    expect(getPetBondLevel(120)).toMatchObject({ level: 2, title: "有点熟悉" });
    expect(getPetBondLevel(319).level).toBe(2);
    expect(getPetBondLevel(320).level).toBe(3);
    expect(getPetBondLevel(320).progress).toBe(0);
    expect(getPetBondLevel(480).progress).toBeCloseTo(0.5, 5);
    expect(getPetBondLevel(99999)).toMatchObject({ level: 10, title: "灵魂羁绊", progress: 1 });
  });

  it("describes the mood, status and warnings of the current stats", () => {
    const happy = createPetVitalsSnapshot(createInitialPetVitals(startMs, {
      affinity: 88,
      satiety: 92,
      mood: 95,
      points: 1200,
    }), startMs);

    expect(happy.moodKey).toBe("delighted");
    expect(happy.statusLabel).toBe("状态极佳");
    expect(happy.warnings).toEqual([]);
    expect(happy.level).toBe(5);
    expect(happy.cooldownUntilMs.feed).toBe(0);

    const sad = createPetVitalsSnapshot(createInitialPetVitals(startMs, {
      affinity: 5,
      satiety: 12,
      mood: 18,
    }), startMs, { enabled: false, hudMode: "hidden" });

    expect(sad.moodKey).toBe("low");
    expect(sad.statusLabel).toBe("饿坏了");
    expect(sad.paused).toBe(true);
    expect(sad.hudMode).toBe("hidden");
    expect(sad.warnings.map((warning) => warning.kind)).toEqual(["hungry", "bored", "lonely"]);
    expect(getPetVitalsWarnings({ affinity: 40, satiety: 40, mood: 40 })).toEqual([]);
  });

  it("reports care needs once a meter is critical and clears them after recovery", () => {
    expect(getPetVitalsNeedEvent({ affinity: 40, satiety: 10, mood: 40 }, "hungry")).toMatchObject({
      kind: "hungry",
      emotion: "sleepy",
    });
    expect(getPetVitalsNeedEvent({ affinity: 40, satiety: 40, mood: 40 }, "hungry")).toBeUndefined();
    expect(isPetVitalsNeedCleared({ affinity: 40, satiety: 35, mood: 40 }, "hungry")).toBe(true);
    expect(isPetVitalsNeedCleared({ affinity: 40, satiety: 34, mood: 40 }, "hungry")).toBe(false);
    expect(isPetVitalsNeedCleared({ affinity: 20, satiety: 40, mood: 40 }, "lonely")).toBe(true);
  });

  it("normalizes corrupted persisted state", () => {
    const normalized = normalizePetVitalsState({
      affinity: 400,
      satiety: -20,
      mood: Number.NaN,
      points: -5,
      lastUpdatedMs: Number.NaN,
      lastInteractionAtMs: Number.NaN,
      lastBonusDayKey: undefined as never,
      cooldownUntilMs: { feed: startMs - 1, play: startMs + 5000 },
      totals: { feed: -3, treat: 2.7, play: 1, pet: 0 },
    }, startMs);

    expect(normalized.affinity).toBe(100);
    expect(normalized.satiety).toBe(0);
    expect(normalized.mood).toBe(0);
    expect(normalized.points).toBe(0);
    expect(normalized.lastUpdatedMs).toBe(startMs);
    expect(normalized.lastBonusDayKey).toBe("");
    expect(normalized.cooldownUntilMs).toEqual({ play: startMs + 5000 });
    expect(normalized.totals).toEqual({ feed: 0, treat: 3, play: 1, pet: 0 });
  });

  it("ships matching panel sizes for the compact and expanded card", () => {
    expect(getPetVitalsPanelSize(false)).toEqual(petVitalsPanelSizes.compact);
    expect(getPetVitalsPanelSize(true)).toEqual(petVitalsPanelSizes.expanded);
    expect(petVitalsPanelSizes.expanded.height).toBeGreaterThan(petVitalsPanelSizes.compact.height);
  });
});

describe("pet vitals card position", () => {
  const workArea = { x: 0, y: 0, width: 800, height: 600 };

  it("keeps a dragged card inside the work area", () => {
    expect(clampPetVitalsHudPosition({ x: 100, y: 120 }, petVitalsPanelSizes.compact, workArea))
      .toEqual({ x: 100, y: 120 });
    // Far right/bottom corners stop one margin short of the edges.
    expect(clampPetVitalsHudPosition({ x: 2000, y: 2000 }, petVitalsPanelSizes.compact, workArea))
      .toEqual({ x: 800 - 240 - 8, y: 600 - 162 - 8 });
    expect(clampPetVitalsHudPosition({ x: -500, y: -500 }, petVitalsPanelSizes.compact, workArea))
      .toEqual({ x: 8, y: 8 });
  });

  it("respects a work area that lives on a secondary display", () => {
    const secondDisplay = { x: 1920, y: -200, width: 1280, height: 1024 };

    expect(clampPetVitalsHudPosition({ x: 2100, y: -100 }, petVitalsPanelSizes.expanded, secondDisplay))
      .toEqual({ x: 2100, y: -100 });
    // A card stored on this display's left edge keeps its y, only x moves.
    expect(clampPetVitalsHudPosition({ x: 0, y: 0 }, petVitalsPanelSizes.expanded, secondDisplay))
      .toEqual({ x: 1928, y: 0 });
    expect(clampPetVitalsHudPosition({ x: 500, y: -900 }, petVitalsPanelSizes.expanded, secondDisplay))
      .toEqual({ x: 1928, y: -192 });
  });

  it("points the tail at the pet from either side of it", () => {
    const petBounds = { x: 400, y: 300, width: 200, height: 200 };
    const petCenterX = petBounds.x + petBounds.width / 2;

    expect(getPetVitalsHudPlacement(700, petCenterX)).toBe("right");
    expect(getPetVitalsHudPlacement(100, petCenterX)).toBe("left");

    const card = { y: 380, height: 162 };
    // pet centre (400) is 20px below the card top.
    expect(getPetVitalsTailOffset(card, petBounds, 18)).toBe(20);
    // A card far above the pet pins the tail near its top edge.
    expect(getPetVitalsTailOffset({ y: 40, height: 162 }, petBounds, 18)).toBe(162 - 18);
    // A card far below the pet pins the tail near its bottom edge.
    expect(getPetVitalsTailOffset({ y: 900, height: 162 }, petBounds, 18)).toBe(18);
  });
});