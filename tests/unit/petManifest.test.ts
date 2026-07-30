import { describe, expect, it } from "vitest";
import type { PetManifest } from "../../src/shared/petManifest";
import manifest from "../../assets/pet/pet.json";

describe("pet manifest", () => {
  it("defines the accepted LacriTomato atlas geometry", () => {
    const pet = manifest as PetManifest;
    expect(pet.id).toBe("lacritomato-mini");
    expect(pet.frameWidth).toBe(192);
    expect(pet.frameHeight).toBe(208);
    expect(pet.columns).toBe(8);
    expect(pet.rows).toBe(9);
  });

  it("defines the Petdex 9-state animation contract", () => {
    const pet = manifest as PetManifest;
    expect(Object.keys(pet.animations)).toEqual(expect.arrayContaining([
      "idle",
      "runRight",
      "runLeft",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "running",
      "review",
    ]));
    expect(pet.animations.runRight.frames).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(pet.animations.runLeft.frames).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(pet.animations.waving.frames).toEqual([24, 25, 26, 27]);
    expect(pet.animations.jumping.frames).toEqual([32, 33, 34, 35, 36]);
    expect(pet.animations.failed.frames).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
    expect(pet.animations.waiting.frames).toEqual([48, 49, 50, 51, 52, 53]);
    expect(pet.animations.running.frames).toEqual([56, 57, 58, 59, 60, 61]);
    expect(pet.animations.review.frames).toEqual([64, 65, 66, 67, 68, 69]);
  });

  it("paces idle blinking like a natural blink cadence", () => {
    const pet = manifest as PetManifest;
    const idle = pet.animations.idle;
    const cycleMs = (idle.frames.length / idle.fps) * 1000;

    expect(cycleMs).toBeGreaterThanOrEqual(3000);
    expect(cycleMs).toBeLessThanOrEqual(6000);
  });
});
