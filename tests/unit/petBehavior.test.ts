import { describe, expect, it } from "vitest";
import {
  createInitialPetBehavior,
  reducePetBehavior,
} from "../../src/shared/petBehavior";

describe("pet behavior state machine", () => {
  it("starts wandering with the Petdex run-right animation when the idle delay elapses", () => {
    const initial = createInitialPetBehavior(0);

    const next = reducePetBehavior(initial, {
      type: "tick",
      now: 2600,
      paused: false,
      wanderEnabled: true,
    });

    expect(next.mode).toBe("wandering");
    expect(next.animation).toBe("runRight");
    expect(next.movement).toEqual({ deltaX: 10, deltaY: 0 });
  });

  it("does not wander while paused or when wandering is disabled", () => {
    const initial = createInitialPetBehavior(0);

    expect(reducePetBehavior(initial, {
      type: "tick",
      now: 2600,
      paused: true,
      wanderEnabled: true,
    }).movement).toBeUndefined();
    expect(reducePetBehavior(initial, {
      type: "tick",
      now: 2600,
      paused: false,
      wanderEnabled: false,
    }).mode).toBe("idle");
  });

  it("emotion actions override wandering and expire back to idle", () => {
    const active = reducePetBehavior(createInitialPetBehavior(0), {
      type: "emotion",
      now: 100,
      emotion: "happy",
      durationMs: 1200,
      bubbleText: "完成啦",
    });

    expect(active.mode).toBe("happy");
    expect(active.animation).toBe("jumping");
    expect(active.bubble?.text).toBe("完成啦");

    const duringEmotion = reducePetBehavior(active, {
      type: "tick",
      now: 900,
      paused: false,
      wanderEnabled: true,
    });

    expect(duringEmotion.mode).toBe("happy");
    expect(duringEmotion.movement).toBeUndefined();

    const expired = reducePetBehavior(duringEmotion, {
      type: "tick",
      now: 1400,
      paused: false,
      wanderEnabled: true,
    });

    expect(expired.mode).toBe("idle");
    expect(expired.animation).toBe("idle");
    expect(expired.bubble).toBeUndefined();
  });

  it("maps transient emotions onto Petdex action states", () => {
    expect(reducePetBehavior(createInitialPetBehavior(0), {
      type: "emotion",
      now: 100,
      emotion: "attentive",
    }).animation).toBe("waiting");
    expect(reducePetBehavior(createInitialPetBehavior(0), {
      type: "emotion",
      now: 100,
      emotion: "thinking",
    }).animation).toBe("running");
    expect(reducePetBehavior(createInitialPetBehavior(0), {
      type: "emotion",
      now: 100,
      emotion: "failed",
    }).animation).toBe("failed");
  });
});
