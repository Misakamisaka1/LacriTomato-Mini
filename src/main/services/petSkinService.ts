import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { AppConfig } from "../../shared/configSchema.js";
import type { ManagedPetSkin, ManagedPetSkinResult, PetAnimationDefinition, PetdexCatalogPet, PetdexCatalogResult, PetManifest, PetSkinLoadResult } from "../../shared/petManifest.js";

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
  petdexLibraryPath?: string;
  petdexManifestUrl?: string;
  fetchJson?: (url: string) => Promise<unknown>;
  fetchBinary?: (url: string) => Promise<Buffer | Uint8Array | ArrayBuffer>;
}

export interface PetSkinService {
  getCurrentSkin(): PetSkinLoadResult;
  importSkinFolder(folderPath: string): PetSkinLoadResult;
  resetSkin(): PetSkinLoadResult;
  openPetdex(): Promise<void>;
  listPetdexPets(): Promise<PetdexCatalogResult>;
  installPetdexSkin(slug: string): Promise<PetSkinLoadResult>;
  listManagedSkins(): ManagedPetSkinResult;
  useManagedSkin(slug: string): PetSkinLoadResult;
  deleteManagedSkin(slug: string): ManagedPetSkinResult;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readPngImageSize(buffer: Buffer): ImageSize | undefined {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG" || buffer.toString("ascii", 12, 16) !== "IHDR") {
    return undefined;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readWebpImageSize(buffer: Buffer): ImageSize | undefined {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return undefined;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (dataOffset + chunkSize > buffer.length) {
      return undefined;
    }

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
      };
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }

    if (chunkType === "VP8 " && chunkSize >= 10
      && buffer[dataOffset + 3] === 0x9d
      && buffer[dataOffset + 4] === 0x01
      && buffer[dataOffset + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return undefined;
}

export function readSpritesheetImageSize(path: string): ImageSize {
  const buffer = readFileSync(path);
  const size = readPngImageSize(buffer) ?? readWebpImageSize(buffer);
  if (!size || size.width <= 0 || size.height <= 0) {
    throw new Error("无法读取皮肤图片尺寸");
  }

  return size;
}

const defaultFrameWidth = 192;
const defaultFrameHeight = 208;
const defaultFps = 6;
const defaultPetdexManifestUrl = "https://petdex.dev/api/manifest";
const petdexRows = ["idle", "runRight", "runLeft", "waving", "jumping", "failed", "waiting", "running", "review"] as const;
type PetdexRowName = typeof petdexRows[number];
const petdexVisibleFrameCounts: Record<PetdexRowName, number> = {
  idle: 6,
  runRight: 8,
  runLeft: 8,
  waving: 4,
  jumping: 5,
  failed: 8,
  waiting: 6,
  running: 6,
  review: 6,
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
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

function readPetdexHeatValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*([kKmM])?/);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.max(0, Math.round(amount * multiplier));
}

function readPetdexHeat(record: Record<string, unknown>) {
  const keys = ["heat", "popularity", "installCount", "installs", "downloadCount", "downloads", "likeCount", "likes"];
  for (const key of keys) {
    const heat = readPetdexHeatValue(record[key]);
    if (heat !== undefined) {
      return heat;
    }
  }

  return 0;
}

function formatCompactHeat(value: number, divisor: number, suffix: string) {
  const compact = value / divisor;
  const formatted = compact >= 10 ? Math.round(compact).toString() : compact.toFixed(1).replace(/\.0$/, "");
  return `${formatted}${suffix}`;
}

function formatPetdexHeat(heat: number) {
  if (heat <= 0) {
    return "热度未知";
  }

  if (heat >= 1_000_000) {
    return `${formatCompactHeat(heat, 1_000_000, "M")} 热度`;
  }

  if (heat >= 1_000) {
    return `${formatCompactHeat(heat, 1_000, "K")} 热度`;
  }

  return `${heat} 热度`;
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

function visibleFrameCountForRow(name: PetdexRowName, columns: number) {
  return columns === 8 ? petdexVisibleFrameCounts[name] ?? columns : columns;
}

function rowFrames(row: number, columns: number, frameCount: number, visibleCount: number) {
  const start = row * columns;
  return Array.from({ length: Math.min(columns, visibleCount) }, (_item, index) => start + index)
    .filter((frame) => frame < frameCount);
}

function synthesizePetdexAnimations(columns: number, frameCount: number): Record<string, PetAnimationDefinition> {
  const rows = new Map<PetdexRowName, number[]>(petdexRows.map((name, index) => [
    name,
    rowFrames(index, columns, frameCount, visibleFrameCountForRow(name, columns)),
  ]));
  const idle = rows.get("idle")?.length ? rows.get("idle") as number[] : [0];
  const getRow = (name: PetdexRowName, fallback = idle) => rows.get(name)?.length ? rows.get(name) as number[] : fallback;
  const runRight = getRow("runRight");
  const runLeft = getRow("runLeft", runRight);
  const waving = getRow("waving");
  const jumping = getRow("jumping", waving);
  const failed = getRow("failed", idle);
  const waiting = getRow("waiting", idle);
  const running = getRow("running", waiting);
  const review = getRow("review", running);

  return withLegacyAnimationAliases({
    idle: { frames: idle, fps: defaultFps, loop: true },
    runRight: { frames: runRight, fps: 9, loop: true },
    runLeft: { frames: runLeft, fps: 9, loop: true },
    waving: { frames: waving, fps: 7, loop: false },
    jumping: { frames: jumping, fps: 7, loop: false },
    failed: { frames: failed, fps: defaultFps, loop: false },
    waiting: { frames: waiting, fps: defaultFps, loop: true },
    running: { frames: running, fps: defaultFps, loop: true },
    review: { frames: review, fps: defaultFps, loop: true },
  });
}

function withLegacyAnimationAliases(animations: Record<string, PetAnimationDefinition>): Record<string, PetAnimationDefinition> {
  const idle = animations.idle ?? { frames: [0], fps: defaultFps, loop: true };
  const runRight = animations.runRight ?? animations.walkRight ?? idle;
  const runLeft = animations.runLeft ?? animations.walkLeft ?? { ...runRight, frames: [...runRight.frames].reverse() };
  const waving = animations.waving ?? animations.attentive ?? idle;
  const jumping = animations.jumping ?? animations.happy ?? waving;
  const failed = animations.failed ?? idle;
  const waiting = animations.waiting ?? animations.attentive ?? idle;
  const running = animations.running ?? animations.thinking ?? animations.review ?? waiting;
  const review = animations.review ?? animations.thinking ?? running;

  return {
    ...animations,
    idle,
    runRight,
    runLeft,
    waving,
    jumping,
    failed,
    waiting,
    running,
    review,
    walkRight: runRight,
    walkLeft: runLeft,
    attentive: waiting,
    happy: jumping,
    thinking: running,
    sleepy: animations.sleepy ?? { frames: idle.frames, fps: 4, loop: true },
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

  const normalizedAnimations = withLegacyAnimationAliases({
    ...synthesizePetdexAnimations(columns, frameCount),
    ...animations,
  });

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

interface PetdexInstallCandidate extends PetdexCatalogPet {
  spritesheetUrl: string;
  petJsonUrl: string;
}

interface PetdexManifestData extends PetdexCatalogResult {
  installablePets: PetdexInstallCandidate[];
}

function sanitizePetdexSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(normalized)) {
    throw new Error("Petdex slug 不安全");
  }

  return normalized;
}

function readTrustedPetdexUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Petdex 下载地址缺失");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Petdex 下载地址不正确");
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (hostname !== "petdex.dev" && hostname !== "assets.petdex.dev")) {
    throw new Error("Petdex 下载地址不安全");
  }

  return url.toString();
}

function readPetdexSpriteFileName(spritesheetUrl: string) {
  const extension = extname(new URL(spritesheetUrl).pathname).toLowerCase();
  if (extension !== ".webp" && extension !== ".png") {
    throw new Error("未找到 spritesheet.webp 或 spritesheet.png");
  }

  return extension === ".png" ? "spritesheet.png" : "spritesheet.webp";
}

function normalizePetdexCandidate(value: unknown): PetdexInstallCandidate | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  try {
    const slug = sanitizePetdexSlug(readString(value, ["slug"], ""));
    const displayName = readString(value, ["displayName", "name", "title"], slug);
    const spritesheetUrl = readTrustedPetdexUrl(value.spritesheetUrl);
    const heat = readPetdexHeat(value);
    return {
      slug,
      displayName,
      kind: readString(value, ["kind", "type"], ""),
      submittedBy: readString(value, ["submittedBy", "author", "creator"], ""),
      previewUrl: spritesheetUrl,
      heat,
      heatLabel: formatPetdexHeat(heat),
      spritesheetUrl,
      petJsonUrl: readTrustedPetdexUrl(value.petJsonUrl),
    };
  } catch {
    return undefined;
  }
}

function normalizePetdexManifest(raw: unknown): PetdexManifestData {
  if (!isRecord(raw) || !Array.isArray(raw.pets)) {
    throw new Error("Petdex 清单格式不正确");
  }

  const installablePets = raw.pets
    .flatMap((item, index): Array<{ pet: PetdexInstallCandidate; index: number }> => {
      const pet = normalizePetdexCandidate(item);
      return pet ? [{ pet, index }] : [];
    })
    .sort((left, right) => right.pet.heat - left.pet.heat || left.index - right.index)
    .map(({ pet }) => pet);

  return {
    generatedAt: readString(raw, ["generatedAt"], ""),
    total: readPositiveInt(raw.total, installablePets.length),
    pets: installablePets.map(({ slug, displayName, kind, submittedBy, previewUrl, heat, heatLabel }) => ({
      slug,
      displayName,
      kind,
      submittedBy,
      previewUrl,
      heat,
      heatLabel,
    })),
    installablePets,
  };
}

function requirePetdexLibraryPath(options: PetSkinServiceOptions) {
  if (!options.petdexLibraryPath?.trim()) {
    throw new Error("Petdex 下载目录未配置");
  }

  return options.petdexLibraryPath;
}

function requireFetchJson(options: PetSkinServiceOptions) {
  if (!options.fetchJson) {
    throw new Error("Petdex 网络服务未配置");
  }

  return options.fetchJson;
}

function requireFetchBinary(options: PetSkinServiceOptions) {
  if (!options.fetchBinary) {
    throw new Error("Petdex 网络服务未配置");
  }

  return options.fetchBinary;
}

function isSameResolvedPath(left: string, right: string) {
  return resolve(left) === resolve(right);
}

function resolveManagedPetSkinFolder(options: PetSkinServiceOptions, slug: string) {
  const libraryPath = resolve(requirePetdexLibraryPath(options));
  const folderPath = resolve(libraryPath, sanitizePetdexSlug(slug));
  const relativePath = relative(libraryPath, folderPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Petdex slug 不安全");
  }

  return folderPath;
}

function toBuffer(value: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function buildDownloadedPetManifest(raw: unknown, pet: PetdexInstallCandidate, spritesheetFileName: string) {
  const manifest = isRecord(raw) ? { ...raw } : {};
  return {
    ...manifest,
    id: readString(manifest, ["id", "slug"], pet.slug),
    slug: pet.slug,
    displayName: readString(manifest, ["displayName", "name", "title"], pet.displayName),
    name: readString(manifest, ["name", "displayName", "title"], pet.displayName),
    spritesheetPath: spritesheetFileName,
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
  async function loadPetdexManifest() {
    const fetchJson = requireFetchJson(options);
    return normalizePetdexManifest(await fetchJson(options.petdexManifestUrl ?? defaultPetdexManifestUrl));
  }

  function listManagedSkins(): ManagedPetSkinResult {
    const libraryPath = resolve(requirePetdexLibraryPath(options));
    if (!existsSync(libraryPath)) {
      return { skins: [] };
    }

    const currentSourcePath = options.getConfig().pet.skinSourcePath.trim();
    const skins = readdirSync(libraryPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry): ManagedPetSkin[] => {
        let slug: string;
        try {
          slug = sanitizePetdexSlug(entry.name);
        } catch {
          return [];
        }

        const folderPath = join(libraryPath, slug);
        try {
          const result = loadFolder(folderPath);
          return [{
            slug,
            displayName: result.skin.manifest.displayName,
            sourcePath: folderPath,
            previewUrl: result.skin.spritesheetUrl,
            current: Boolean(currentSourcePath) && isSameResolvedPath(currentSourcePath, folderPath),
          }];
        } catch {
          return [];
        }
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN") || left.slug.localeCompare(right.slug));

    return { skins };
  }

  function useManagedSkin(slug: string) {
    return loadFolder(resolveManagedPetSkinFolder(options, slug));
  }

  function deleteManagedSkin(slug: string) {
    const folderPath = resolveManagedPetSkinFolder(options, slug);
    const currentSourcePath = options.getConfig().pet.skinSourcePath.trim();
    if (currentSourcePath && isSameResolvedPath(currentSourcePath, folderPath)) {
      throw new Error("请先切换到其他皮肤再删除当前皮肤");
    }

    rmSync(folderPath, { recursive: true, force: true });
    return listManagedSkins();
  }
  async function installPetdexSkin(slug: string) {
    const safeSlug = sanitizePetdexSlug(slug);
    const manifest = await loadPetdexManifest();
    const pet = manifest.installablePets.find((item) => item.slug === safeSlug);
    if (!pet) {
      throw new Error("未找到 Petdex 皮肤");
    }

    const fetchJson = requireFetchJson(options);
    const fetchBinary = requireFetchBinary(options);
    const libraryPath = requirePetdexLibraryPath(options);
    const folderPath = join(libraryPath, safeSlug);
    const spritesheetFileName = readPetdexSpriteFileName(pet.spritesheetUrl);
    const petJson = await fetchJson(pet.petJsonUrl);
    const spritesheet = toBuffer(await fetchBinary(pet.spritesheetUrl));

    mkdirSync(folderPath, { recursive: true });
    writeFileSync(join(folderPath, spritesheetFileName), spritesheet);
    writeFileSync(join(folderPath, "pet.json"), JSON.stringify(buildDownloadedPetManifest(petJson, pet, spritesheetFileName), null, 2), "utf8");

    return withFallback(() => loadFolder(folderPath));
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
    async listPetdexPets() {
      const manifest = await loadPetdexManifest();
      return {
        generatedAt: manifest.generatedAt,
        total: manifest.total,
        pets: manifest.pets,
      };
    },
    installPetdexSkin,
    listManagedSkins,
    useManagedSkin,
    deleteManagedSkin,
  };
}
