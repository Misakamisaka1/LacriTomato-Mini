import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPetSkinService, readSpritesheetImageSize } from "../../src/main/services/petSkinService";
import { defaultAppConfig } from "../../src/shared/configSchema";

const cleanupDirs: string[] = [];

function makeTempDir(prefix: string) {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(folder);
  return folder;
}

function writeNativeSkin(folder: string, patch: Record<string, unknown> = {}) {
  writeFileSync(join(folder, "spritesheet.webp"), "fake image", "utf8");
  writeFileSync(join(folder, "pet.json"), JSON.stringify({
    id: "mint",
    displayName: "Mint",
    spritesheetPath: "spritesheet.webp",
    frameWidth: 192,
    frameHeight: 208,
    columns: 8,
    rows: 9,
    animations: {
      idle: { frames: [0], fps: 6, loop: true },
      walkRight: { frames: [16, 17], fps: 6, loop: true },
    },
    ...patch,
  }), "utf8");
}

function createService(options: { skinSourcePath?: string } = {}) {
  const bundledFolder = makeTempDir("petdex-bundled-");
  writeNativeSkin(bundledFolder, { id: "lacritomato-mini", displayName: "LacriTomato Mini" });
  const config = {
    ...defaultAppConfig,
    pet: { ...defaultAppConfig.pet, skinSourcePath: options.skinSourcePath ?? "" },
  };

  return createPetSkinService({
    getConfig: () => config,
    bundledManifestPath: join(bundledFolder, "pet.json"),
    bundledSpritesheetPath: join(bundledFolder, "spritesheet.webp"),
    readImageSize: vi.fn(() => ({ width: 1536, height: 1872 })),
    makeFileUrl: (path) => `file:///${path.replaceAll("\\", "/")}`,
    openExternal: vi.fn(),
  });
}

afterEach(() => {
  for (const folder of cleanupDirs.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("pet skin service", () => {
  it("reads the bundled WebP spritesheet dimensions from the file header", () => {
    expect(readSpritesheetImageSize(join(process.cwd(), "assets/pet/spritesheet.webp"))).toEqual({
      width: 1536,
      height: 1872,
    });
  });

  it("loads the real bundled skin with header-based image dimensions", () => {
    const service = createPetSkinService({
      getConfig: () => defaultAppConfig,
      bundledManifestPath: join(process.cwd(), "assets/pet/pet.json"),
      bundledSpritesheetPath: join(process.cwd(), "assets/pet/spritesheet.webp"),
      readImageSize: readSpritesheetImageSize,
      makeFileUrl: (path) => `file:///${path.replaceAll("\\", "/")}`,
      openExternal: vi.fn(),
    });

    const result = service.getCurrentSkin();

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.manifest.id).toBe("lacritomato-mini");
    expect(result.skin.spritesheetUrl).toContain("spritesheet.webp");
  });

  it("loads the bundled fallback skin", () => {
    const service = createService();

    const result = service.getCurrentSkin();

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.source).toBe("bundled");
    expect(result.skin.manifest.id).toBe("lacritomato-mini");
  });

  it("imports a native manifest folder", () => {
    const folder = makeTempDir("petdex-skin-");
    writeNativeSkin(folder);
    const service = createService();

    const result = service.importSkinFolder(folder);

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.source).toBe("local");
    expect(result.skin.sourcePath).toBe(folder);
    expect(result.skin.manifest.displayName).toBe("Mint");
    expect(result.skin.spritesheetUrl).toContain("spritesheet.webp");
  });

  it("rejects unsafe spritesheet paths and falls back", () => {
    const folder = makeTempDir("petdex-skin-");
    writeNativeSkin(folder, { spritesheetPath: "../secret.webp" });
    const service = createService();

    const result = service.importSkinFolder(folder);

    expect(result.fallbackUsed).toBe(true);
    expect(result.warning).toBe("皮肤图片路径不安全");
    expect(result.skin.source).toBe("bundled");
  });

  it("synthesizes required app animations without Petdex transparent tail frames", () => {
    const folder = makeTempDir("petdex-skin-");
    writeFileSync(join(folder, "spritesheet.webp"), "fake image", "utf8");
    writeFileSync(join(folder, "pet.json"), JSON.stringify({
      slug: "boba",
      name: "Boba",
      spritesheetPath: "spritesheet.webp",
    }), "utf8");
    const service = createService();

    const result = service.importSkinFolder(folder);

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.manifest.id).toBe("boba");
    expect(result.skin.manifest.animations.idle.frames).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.skin.manifest.animations.sleepy.frames).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.skin.manifest.animations.attentive.frames).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(result.skin.manifest.animations.walkRight.frames).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(result.skin.manifest.animations.walkLeft.frames).toEqual([23, 22, 21, 20, 19, 18, 17, 16]);
    expect(result.skin.manifest.animations.thinking.frames).toEqual([32, 33, 34, 35, 36]);
    expect(result.skin.manifest.animations.happy.frames).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
  });
});
