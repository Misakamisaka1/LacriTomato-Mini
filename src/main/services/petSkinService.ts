import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { AppConfig } from "../../shared/configSchema.js";
import type { PetAnimationDefinition, PetManifest, PetSkinLoadResult } from "../../shared/petManifest.js";

export interface ImageSize {
  width: number;
  height: number;
}

export interface PetSkinServiceOptions {
  getConfig(): AppConfig;
  bundledManifestPath: string;
  bundledSpritesheetPath: string;
  readImageSize(path: string): ImageSize;
  makeFileUrl(path: string): string;
  openExternal(url: string): Promise<unknown> | unknown;
}

export interface PetSkinService {
  getCurrentSkin(): PetSkinLoadResult;
  importSkinFolder(folderPath: string): PetSkinLoadResult;
  resetSkin(): PetSkinLoadResult;
  openPetdex(): Promise<void>;
}

const defaultFrameWidth = 192;
const defaultFrameHeight = 208;
const defaultFps = 6;
const petdexRows = ["idle", "wave", "run", "failed", "review", "jump", "extra1", "extra2", "extra3"];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function readPositiveInt(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assertSafeSpritesheetPath(folderPath: string, spritesheetPath: string) {
  const normalizedInput = normalize(spritesheetPath.trim());
  if (!normalizedInput || isAbsolute(normalizedInput)) {
    throw new Error("皮肤图片路径不安全");
  }

  const extension = extname(normalizedInput).toLowerCase();
  if (extension !== ".webp" && extension !== ".png") {
    throw new Error("未找到 spritesheet.webp 或 spritesheet.png");
  }

  const resolvedFolder = resolve(folderPath);
  const resolvedSprite = resolve(resolvedFolder, normalizedInput);
  const relativePath = relative(resolvedFolder, resolvedSprite);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("皮肤图片路径不安全");
  }

  if (!existsSync(resolvedSprite)) {
    throw new Error("未找到 spritesheet.webp 或 spritesheet.png");
  }

  return resolvedSprite;
}

function findSpritesheetPath(folderPath: string, manifest: Record<string, unknown>) {
  const declared = typeof manifest.spritesheetPath === "string" ? manifest.spritesheetPath.trim() : "";
  if (declared) {
    return declared;
  }

  if (existsSync(join(folderPath, "spritesheet.webp"))) {
    return "spritesheet.webp";
  }

  if (existsSync(join(folderPath, "spritesheet.png"))) {
    return "spritesheet.png";
  }

  throw new Error("未找到 spritesheet.webp 或 spritesheet.png");
}

function normalizeAnimation(value: unknown, frameCount: number): PetAnimationDefinition | undefined {
  if (!isRecord(value) || !Array.isArray(value.frames)) {
    return undefined;
  }

  const frames = value.frames
    .map((frame) => Math.floor(Number(frame)))
    .filter((frame) => Number.isFinite(frame) && frame >= 0 && frame < frameCount);

  if (frames.length === 0) {
    return undefined;
  }

  return {
    frames,
    fps: readPositiveInt(value.fps, defaultFps),
    loop: typeof value.loop === "boolean" ? value.loop : true,
  };
}

function rowFrames(row: number, columns: number, frameCount: number) {
  const start = row * columns;
  return Array.from({ length: columns }, (_item, index) => start + index).filter((frame) => frame < frameCount);
}

function synthesizePetdexAnimations(columns: number, frameCount: number): Record<string, PetAnimationDefinition> {
  const rows = new Map(petdexRows.map((name, index) => [name, rowFrames(index, columns, frameCount)]));
  const idle = rows.get("idle")?.length ? rows.get("idle") as number[] : [0];
  const run = rows.get("run")?.length ? rows.get("run") as number[] : idle;
  const wave = rows.get("wave")?.length ? rows.get("wave") as number[] : idle;
  const review = rows.get("review")?.length ? rows.get("review") as number[] : idle;
  const jump = rows.get("jump")?.length ? rows.get("jump") as number[] : wave;

  return {
    idle: { frames: idle, fps: defaultFps, loop: true },
    walkRight: { frames: run, fps: defaultFps, loop: true },
    walkLeft: { frames: [...run].reverse(), fps: defaultFps, loop: true },
    attentive: { frames: wave, fps: defaultFps, loop: false },
    happy: { frames: jump, fps: defaultFps, loop: false },
    thinking: { frames: review, fps: defaultFps, loop: true },
    sleepy: { frames: idle, fps: 4, loop: true },
  };
}

function normalizeManifest(
  raw: unknown,
  folderPath: string,
  readImageSize: (path: string) => ImageSize,
): { manifest: PetManifest; spritesheetPath: string } {
  if (!isRecord(raw)) {
    throw new Error("pet.json 格式不正确");
  }

  const declaredSprite = findSpritesheetPath(folderPath, raw);
  const spritePath = assertSafeSpritesheetPath(folderPath, declaredSprite);
  const size = readImageSize(spritePath);
  const frameWidth = readPositiveInt(raw.frameWidth, defaultFrameWidth);
  const frameHeight = readPositiveInt(raw.frameHeight, defaultFrameHeight);

  if (size.width <= 0 || size.height <= 0 || size.width % frameWidth !== 0 || size.height % frameHeight !== 0) {
    throw new Error("皮肤图片尺寸不符合动画网格");
  }

  const inferredColumns = size.width / frameWidth;
  const inferredRows = size.height / frameHeight;
  const columns = readPositiveInt(raw.columns, inferredColumns);
  const rows = readPositiveInt(raw.rows, inferredRows);
  if (columns !== inferredColumns || rows !== inferredRows) {
    throw new Error("皮肤图片尺寸不符合动画网格");
  }

  const frameCount = columns * rows;
  const animations: Record<string, PetAnimationDefinition> = {};

  if (isRecord(raw.animations)) {
    for (const [name, value] of Object.entries(raw.animations)) {
      const animation = normalizeAnimation(value, frameCount);
      if (animation) {
        animations[name] = animation;
      }
    }
  }

  const normalizedAnimations = {
    ...synthesizePetdexAnimations(columns, frameCount),
    ...animations,
  };

  if (!normalizedAnimations.idle.frames.length) {
    throw new Error("皮肤动画信息不完整");
  }

  return {
    spritesheetPath: spritePath,
    manifest: {
      id: readString(raw, ["id", "slug"], basename(folderPath)),
      displayName: readString(raw, ["displayName", "name", "title"], basename(folderPath)),
      description: typeof raw.description === "string" ? raw.description : undefined,
      spritesheetPath: basename(spritePath),
      frameWidth,
      frameHeight,
      columns,
      rows,
      animations: normalizedAnimations,
    },
  };
}

export function createPetSkinService(options: PetSkinServiceOptions): PetSkinService {
  function loadBundled(warning?: string): PetSkinLoadResult {
    const raw = readJson(options.bundledManifestPath);
    const folderPath = dirname(options.bundledManifestPath);
    const normalized = normalizeManifest(raw, folderPath, options.readImageSize);
    const spritesheetUrl = options.makeFileUrl(normalized.spritesheetPath || options.bundledSpritesheetPath);

    return {
      skin: {
        manifest: normalized.manifest,
        spritesheetUrl,
        source: "bundled",
      },
      fallbackUsed: Boolean(warning),
      warning,
    };
  }

  function loadFolder(folderPath: string): PetSkinLoadResult {
    const manifestPath = join(folderPath, "pet.json");
    if (!existsSync(manifestPath)) {
      throw new Error("未找到 pet.json");
    }

    const normalized = normalizeManifest(readJson(manifestPath), folderPath, options.readImageSize);
    return {
      skin: {
        manifest: normalized.manifest,
        spritesheetUrl: options.makeFileUrl(normalized.spritesheetPath),
        sourcePath: folderPath,
        source: "local",
      },
      fallbackUsed: false,
    };
  }

  function withFallback(action: () => PetSkinLoadResult) {
    try {
      return action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "皮肤加载失败";
      return loadBundled(message);
    }
  }

  return {
    getCurrentSkin() {
      const sourcePath = options.getConfig().pet.skinSourcePath.trim();
      return sourcePath ? withFallback(() => loadFolder(sourcePath)) : loadBundled();
    },
    importSkinFolder(folderPath) {
      return withFallback(() => loadFolder(folderPath));
    },
    resetSkin() {
      return loadBundled();
    },
    async openPetdex() {
      await options.openExternal("https://petdex.dev/");
    },
  };
}