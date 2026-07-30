import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  const petdexLibraryPath = makeTempDir("petdex-library-");
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
    petdexLibraryPath,
    fetchJson: vi.fn(),
    fetchBinary: vi.fn(),
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

  it("synthesizes Petdex 9-state animations without transparent tail frames", () => {
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
    expect(result.skin.manifest.animations.runRight.frames).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(result.skin.manifest.animations.runLeft.frames).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(result.skin.manifest.animations.waving.frames).toEqual([24, 25, 26, 27]);
    expect(result.skin.manifest.animations.jumping.frames).toEqual([32, 33, 34, 35, 36]);
    expect(result.skin.manifest.animations.failed.frames).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
    expect(result.skin.manifest.animations.waiting.frames).toEqual([48, 49, 50, 51, 52, 53]);
    expect(result.skin.manifest.animations.running.frames).toEqual([56, 57, 58, 59, 60, 61]);
    expect(result.skin.manifest.animations.review.frames).toEqual([64, 65, 66, 67, 68, 69]);
  });

  it("keeps legacy animation aliases pointed at Petdex states", () => {
    const folder = makeTempDir("petdex-skin-");
    writeFileSync(join(folder, "spritesheet.webp"), "fake image", "utf8");
    writeFileSync(join(folder, "pet.json"), JSON.stringify({
      slug: "boba",
      name: "Boba",
      spritesheetPath: "spritesheet.webp",
    }), "utf8");
    const service = createService();

    const result = service.importSkinFolder(folder);
    const animations = result.skin.manifest.animations;

    expect(animations.walkRight.frames).toEqual(animations.runRight.frames);
    expect(animations.walkLeft.frames).toEqual(animations.runLeft.frames);
    expect(animations.attentive.frames).toEqual(animations.waiting.frames);
    expect(animations.happy.frames).toEqual(animations.jumping.frames);
    expect(animations.thinking.frames).toEqual(animations.running.frames);
    expect(animations.sleepy.frames).toEqual(animations.idle.frames);
  });

  it("lists installable pets from the Petdex manifest", async () => {
    const fetchJson = vi.fn(async () => ({
      generatedAt: "2026-07-06T19:45:10.131Z",
      total: 3,
      pets: [
        {
          slug: "mint",
          displayName: "Mint",
          kind: "creature",
          submittedBy: "leaf",
          installCount: 12,
          spritesheetUrl: "https://assets.petdex.dev/pets/mint/sprite.webp",
          petJsonUrl: "https://assets.petdex.dev/pets/mint/petjson.json",
        },
        {
          slug: "boba",
          displayName: "Boba",
          kind: "creature",
          submittedBy: "railly",
          installs: "4.5K",
          spritesheetUrl: "https://assets.petdex.dev/pets/boba/sprite.webp",
          petJsonUrl: "https://assets.petdex.dev/pets/boba/petjson.json",
        },
        { slug: "broken", displayName: "Broken" },
      ],
    }));
    const service = createPetSkinService({
      getConfig: () => defaultAppConfig,
      bundledManifestPath: join(process.cwd(), "assets/pet/pet.json"),
      bundledSpritesheetPath: join(process.cwd(), "assets/pet/spritesheet.webp"),
      readImageSize: readSpritesheetImageSize,
      makeFileUrl: (path) => `file:///${path.replaceAll("\\", "/")}`,
      openExternal: vi.fn(),
      petdexLibraryPath: makeTempDir("petdex-library-"),
      fetchJson,
      fetchBinary: vi.fn(),
    });

    const result = await service.listPetdexPets();

    expect(fetchJson).toHaveBeenCalledWith("https://petdex.dev/api/manifest");
    expect(result.generatedAt).toBe("2026-07-06T19:45:10.131Z");
    expect(result.total).toBe(3);
    expect(result.pets).toEqual([
      {
        slug: "boba",
        displayName: "Boba",
        kind: "creature",
        submittedBy: "railly",
        previewUrl: "https://assets.petdex.dev/pets/boba/sprite.webp",
        heat: 4500,
        heatLabel: "4.5K 热度",
      },
      {
        slug: "mint",
        displayName: "Mint",
        kind: "creature",
        submittedBy: "leaf",
        previewUrl: "https://assets.petdex.dev/pets/mint/sprite.webp",
        heat: 12,
        heatLabel: "12 热度",
      },
    ]);
  });

  it("lists managed downloaded skins, switches them locally, and blocks deleting the current skin", () => {
    const bundledFolder = makeTempDir("petdex-bundled-");
    const petdexLibraryPath = makeTempDir("petdex-library-");
    const bobaFolder = join(petdexLibraryPath, "boba");
    const mintFolder = join(petdexLibraryPath, "mint");
    mkdirSync(bobaFolder);
    mkdirSync(mintFolder);
    writeNativeSkin(bundledFolder, { id: "lacritomato-mini", displayName: "LacriTomato Mini" });
    writeNativeSkin(bobaFolder, { id: "boba", displayName: "Boba" });
    writeNativeSkin(mintFolder, { id: "mint", displayName: "Mint" });
    const config = {
      ...defaultAppConfig,
      pet: { ...defaultAppConfig.pet, skinSourcePath: bobaFolder },
    };
    const service = createPetSkinService({
      getConfig: () => config,
      bundledManifestPath: join(bundledFolder, "pet.json"),
      bundledSpritesheetPath: join(bundledFolder, "spritesheet.webp"),
      readImageSize: vi.fn(() => ({ width: 1536, height: 1872 })),
      makeFileUrl: (path) => `file:///${path.replaceAll("\\", "/")}`,
      openExternal: vi.fn(),
      petdexLibraryPath,
      fetchJson: vi.fn(),
      fetchBinary: vi.fn(),
    });

    expect(service.listManagedSkins()).toEqual({
      skins: [
        expect.objectContaining({ slug: "boba", displayName: "Boba", sourcePath: bobaFolder, current: true }),
        expect.objectContaining({ slug: "mint", displayName: "Mint", sourcePath: mintFolder, current: false }),
      ],
    });

    const selected = service.useManagedSkin("mint");
    expect(selected.fallbackUsed).toBe(false);
    expect(selected.skin.manifest.displayName).toBe("Mint");
    expect(selected.skin.sourcePath).toBe(mintFolder);

    expect(() => service.deleteManagedSkin("boba")).toThrow("请先切换到其他皮肤再删除当前皮肤");
    expect(service.deleteManagedSkin("mint").skins.map((skin) => skin.slug)).toEqual(["boba"]);
    expect(existsSync(mintFolder)).toBe(false);
  });

  it("downloads a Petdex pet into the managed library and applies it through local validation", async () => {
    const petdexLibraryPath = makeTempDir("petdex-library-");
    const fetchJson = vi.fn(async (url: string) => {
      if (url === "https://petdex.dev/api/manifest") {
        return {
          generatedAt: "2026-07-06T19:45:10.131Z",
          total: 1,
          pets: [{
            slug: "boba",
            displayName: "Boba",
            kind: "creature",
            submittedBy: "railly",
            spritesheetUrl: "https://assets.petdex.dev/pets/boba/sprite.webp",
            petJsonUrl: "https://assets.petdex.dev/pets/boba/petjson.json",
          }],
        };
      }

      return {
        slug: "boba",
        name: "Boba",
        spritesheetPath: "remote-name.webp",
      };
    });
    const fetchBinary = vi.fn(async () => Buffer.from("fake image"));
    const service = createPetSkinService({
      getConfig: () => defaultAppConfig,
      bundledManifestPath: join(process.cwd(), "assets/pet/pet.json"),
      bundledSpritesheetPath: join(process.cwd(), "assets/pet/spritesheet.webp"),
      readImageSize: vi.fn(() => ({ width: 1536, height: 1872 })),
      makeFileUrl: (path) => `file:///${path.replaceAll("\\", "/")}`,
      openExternal: vi.fn(),
      petdexLibraryPath,
      fetchJson,
      fetchBinary,
    });

    const result = await service.installPetdexSkin("boba");

    expect(fetchJson).toHaveBeenCalledWith("https://petdex.dev/api/manifest");
    expect(fetchJson).toHaveBeenCalledWith("https://assets.petdex.dev/pets/boba/petjson.json");
    expect(fetchBinary).toHaveBeenCalledWith("https://assets.petdex.dev/pets/boba/sprite.webp");
    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.manifest.id).toBe("boba");
    expect(result.skin.manifest.displayName).toBe("Boba");
    expect(result.skin.sourcePath).toBe(join(petdexLibraryPath, "boba"));
    expect(result.skin.spritesheetUrl).toContain("spritesheet.webp");
  });
});
