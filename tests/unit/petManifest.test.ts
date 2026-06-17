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

  it("defines idle and menu attention animations", () => {
    const pet = manifest as PetManifest;
    expect(pet.animations.idle.frames.length).toBeGreaterThan(0);
    expect(pet.animations.attentive.frames.length).toBeGreaterThan(0);
  });
});
