import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPetPositionService } from "../../src/main/services/petPositionService";

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("pet position service", () => {
  it("returns no saved position on first run", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-position-"));
    const service = createPetPositionService({ userDataPath: dir });

    expect(service.load()).toBeUndefined();
  });

  it("persists and reloads the saved anchor with rounded coordinates", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-position-"));
    const service = createPetPositionService({ userDataPath: dir });

    service.save({ x: 1482.4, y: 669.6 });

    expect(service.load()).toEqual({ x: 1482, y: 670 });
    expect(JSON.parse(readFileSync(join(dir, "pet-position.json"), "utf8"))).toEqual({ x: 1482, y: 670 });
  });

  it("reloads a previously saved anchor on a new service instance", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-position-"));
    createPetPositionService({ userDataPath: dir }).save({ x: 500, y: 800 });

    expect(createPetPositionService({ userDataPath: dir }).load()).toEqual({ x: 500, y: 800 });
  });

  it("ignores a corrupt position file", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-position-"));
    writeFileSync(join(dir, "pet-position.json"), "{not-json", "utf8");

    expect(createPetPositionService({ userDataPath: dir }).load()).toBeUndefined();
  });

  it("ignores invalid anchors and keeps the previous position", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-position-"));
    const service = createPetPositionService({ userDataPath: dir });
    service.save({ x: 100, y: 200 });

    service.save({ x: Number.NaN, y: 300 });

    expect(service.load()).toEqual({ x: 100, y: 200 });
  });
});
