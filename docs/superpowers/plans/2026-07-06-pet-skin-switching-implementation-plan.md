# Pet Skin Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe local Petdex-compatible skin import, active skin switching, Petdex discovery, and bundled fallback behavior for the desktop pet.

**Architecture:** Main process owns skin validation, folder selection, config persistence, and safe spritesheet URL creation. Preload exposes narrow pet-skin IPC methods. Renderer displays active skin status in Settings and loads the current skin dynamically in PetApp, while bundled LacriTomato Mini remains the immediate fallback.

**Tech Stack:** Electron 36, React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, Node `fs/path/url`, Electron `nativeImage` and `shell`.

---

## File Structure

- Modify `src/shared/petManifest.ts`: add `PetSkin`, `PetSkinLoadResult`, and helper-facing animation names.
- Modify `src/shared/configSchema.ts`: add `pet.skinSourcePath` to schema and defaults.
- Modify `src/shared/ipcChannels.ts`: add pet skin IPC channels.
- Modify `src/preload/api.ts`: add pet skin methods to the renderer API type.
- Modify `src/preload/index.ts`: wire pet skin IPC calls and event listener.
- Modify `src/main/appPaths.ts`: expose bundled pet manifest and spritesheet paths.
- Create `src/main/services/petSkinService.ts`: validate and normalize local pet folders, load fallback skin, open Petdex.
- Modify `src/main/ipc/registerCoreIpc.ts`: register skin IPC handlers and broadcast skin changes.
- Modify `src/main/app.ts`: instantiate `petSkinService` and pass it into IPC registration.
- Modify `src/renderer/shell/SettingsApp.tsx`: add skin controls and status in the "桌宠" section.
- Modify `src/renderer/shell/SettingsApp.css`: add compact status/action styling for skin controls.
- Modify `src/renderer/shell/PetApp.tsx`: replace hardcoded manifest usage with runtime skin state.
- Test `tests/unit/configSchema.test.ts`: config default coverage.
- Test `tests/unit/configService.test.ts`: persisted config migration coverage.
- Create `tests/unit/petSkinService.test.ts`: service validation and normalization coverage.
- Create `tests/unit/registerCoreIpc.petSkin.test.ts`: IPC coverage for import/reset/open/broadcast.
- Modify `tests/renderer/SettingsApp.test.tsx`: renderer Settings skin UI coverage.
- Modify `tests/renderer/PetApp.test.tsx`: dynamic skin loading and fallback coverage.

## Task 1: Shared Types and Config Schema

**Files:**
- Modify: `src/shared/petManifest.ts`
- Modify: `src/shared/configSchema.ts`
- Test: `tests/unit/configSchema.test.ts`
- Test: `tests/unit/configService.test.ts`

- [ ] **Step 1: Write the failing config tests**

Add these assertions to `tests/unit/configSchema.test.ts` inside the existing config defaults test block, or create a new `it("defaults pet skin source to bundled skin", ...)` test:

```ts
expect(defaultAppConfig.pet.skinSourcePath).toBe("");
expect(appConfigSchema.parse(defaultAppConfig).pet.skinSourcePath).toBe("");
```

Add this assertion to `tests/unit/configService.test.ts` in `merges old persisted config with recording defaults`:

```ts
expect(service.getConfig().pet.skinSourcePath).toBe("");
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm test -- tests/unit/configSchema.test.ts tests/unit/configService.test.ts
```

Expected: FAIL because `skinSourcePath` does not exist on `defaultAppConfig.pet`.

- [ ] **Step 3: Add shared skin result types**

Update `src/shared/petManifest.ts` to:

```ts
export interface PetAnimationDefinition {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface PetManifest {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  animations: Record<string, PetAnimationDefinition>;
}

export type PetSkinSource = "bundled" | "local";

export interface PetSkin {
  manifest: PetManifest;
  spritesheetUrl: string;
  sourcePath?: string;
  source: PetSkinSource;
}

export interface PetSkinLoadResult {
  skin: PetSkin;
  fallbackUsed: boolean;
  warning?: string;
}
```

- [ ] **Step 4: Add `skinSourcePath` to config schema and defaults**

Update the `pet` object in `src/shared/configSchema.ts`:

```ts
pet: z.object({
  defaultHeight: z.number().int().min(96).max(480),
  opacity: z.number().min(0.3).max(1),
  alwaysOnTop: z.boolean(),
  wanderEnabled: z.boolean(),
  animationSpeed: z.number().min(0.5).max(2),
  skinSourcePath: z.string().default(""),
}),
```

Update `defaultAppConfig.pet`:

```ts
pet: {
  defaultHeight: 224,
  opacity: 1,
  alwaysOnTop: true,
  wanderEnabled: false,
  animationSpeed: 1,
  skinSourcePath: "",
},
```

- [ ] **Step 5: Run the tests and verify GREEN**

Run:

```powershell
npm test -- tests/unit/configSchema.test.ts tests/unit/configService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/petManifest.ts src/shared/configSchema.ts tests/unit/configSchema.test.ts tests/unit/configService.test.ts
git commit -m "feat: add pet skin config shape"
```

## Task 2: Pet Skin Service

**Files:**
- Create: `src/main/services/petSkinService.ts`
- Modify: `src/main/appPaths.ts`
- Test: `tests/unit/petSkinService.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `tests/unit/petSkinService.test.ts` with these tests. The fake image-size reader keeps service tests independent from Electron:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { createPetSkinService } from "../../src/main/services/petSkinService";

let dir: string | undefined;

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
  const bundledFolder = mkdtempSync(join(tmpdir(), "petdex-bundled-"));
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
    makeFileUrl: (path) => `file:///${path.replaceAll("\\\\", "/")}`,
    openExternal: vi.fn(),
  });
}

afterEach(() => {
  dir = undefined;
});

describe("pet skin service", () => {
  it("loads the bundled fallback skin", () => {
    const service = createService();

    const result = service.getCurrentSkin();

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.source).toBe("bundled");
    expect(result.skin.manifest.id).toBe("lacritomato-mini");
  });

  it("imports a native manifest folder", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-skin-"));
    writeNativeSkin(dir);
    const service = createService();

    const result = service.importSkinFolder(dir);

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.source).toBe("local");
    expect(result.skin.sourcePath).toBe(dir);
    expect(result.skin.manifest.displayName).toBe("Mint");
    expect(result.skin.spritesheetUrl).toContain("spritesheet.webp");
  });

  it("rejects unsafe spritesheet paths and falls back", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-skin-"));
    writeNativeSkin(dir, { spritesheetPath: "../secret.webp" });
    const service = createService();

    const result = service.importSkinFolder(dir);

    expect(result.fallbackUsed).toBe(true);
    expect(result.warning).toBe("皮肤图片路径不安全");
    expect(result.skin.source).toBe("bundled");
  });

  it("synthesizes required app animations for row-state Petdex skins", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-skin-"));
    writeFileSync(join(dir, "spritesheet.webp"), "fake image", "utf8");
    writeFileSync(join(dir, "pet.json"), JSON.stringify({
      slug: "boba",
      name: "Boba",
      spritesheetPath: "spritesheet.webp",
    }), "utf8");
    const service = createService();

    const result = service.importSkinFolder(dir);

    expect(result.fallbackUsed).toBe(false);
    expect(result.skin.manifest.id).toBe("boba");
    expect(result.skin.manifest.animations.idle.frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.skin.manifest.animations.walkRight.frames[0]).toBe(16);
    expect(result.skin.manifest.animations.happy.frames[0]).toBe(40);
  });
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run:

```powershell
npm test -- tests/unit/petSkinService.test.ts
```

Expected: FAIL because `createPetSkinService` does not exist.

- [ ] **Step 3: Extend app resource paths**

Update `src/main/appPaths.ts`:

```ts
export interface AppResourcePaths {
  preloadPath: string;
  rendererIndexPath: string;
  trayIconPath: string;
  trainedDataPath: string;
  ffmpegPath: string;
  wasapiLoopbackHelperPath: string;
  bundledPetManifestPath: string;
  bundledPetSpritesheetPath: string;
}

export function createAppResourcePaths(appRoot: string): AppResourcePaths {
  return {
    preloadPath: join(appRoot, "dist/preload/index.cjs"),
    rendererIndexPath: join(appRoot, "dist/renderer/index.html"),
    trayIconPath: join(appRoot, "assets/pet/tray-icon.png"),
    trainedDataPath: appRoot,
    ffmpegPath: join(appRoot, "assets/recording/ffmpeg.exe"),
    wasapiLoopbackHelperPath: join(appRoot, "assets/recording/wasapi-loopback-helper.exe"),
    bundledPetManifestPath: join(appRoot, "assets/pet/pet.json"),
    bundledPetSpritesheetPath: join(appRoot, "assets/pet/spritesheet.webp"),
  };
}
```

- [ ] **Step 4: Implement `petSkinService`**

Create `src/main/services/petSkinService.ts` with these exported interfaces and factory:

```ts
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
const petdexRows = ["idle", "wave", "run", "failed", "review", "jump", "extra1", "extra2"];

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
  if (!spritesheetPath || isAbsolute(spritesheetPath) || spritesheetPath.includes("..")) {
    throw new Error("皮肤图片路径不安全");
  }

  const extension = extname(spritesheetPath).toLowerCase();
  if (extension !== ".webp" && extension !== ".png") {
    throw new Error("未找到 spritesheet.webp 或 spritesheet.png");
  }

  const resolvedFolder = resolve(folderPath);
  const resolvedSprite = resolve(resolvedFolder, normalize(spritesheetPath));
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
  const declared = typeof manifest.spritesheetPath === "string" ? manifest.spritesheetPath : "";
  if (declared.trim()) {
    return declared.trim();
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

function normalizeManifest(raw: unknown, folderPath: string, readImageSize: (path: string) => ImageSize): { manifest: PetManifest; spritesheetPath: string } {
  if (!isRecord(raw)) {
    throw new Error("pet.json 格式不正确");
  }

  const declaredSprite = findSpritesheetPath(folderPath, raw);
  const spritePath = assertSafeSpritesheetPath(folderPath, declaredSprite);
  const size = readImageSize(spritePath);
  const frameWidth = readPositiveInt(raw.frameWidth, defaultFrameWidth);
  const frameHeight = readPositiveInt(raw.frameHeight, defaultFrameHeight);

  if (size.width % frameWidth !== 0 || size.height % frameHeight !== 0) {
    throw new Error("皮肤图片尺寸不符合动画网格");
  }

  const columns = readPositiveInt(raw.columns, size.width / frameWidth);
  const rows = readPositiveInt(raw.rows, size.height / frameHeight);
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

  const normalizedAnimations = Object.keys(animations).length > 0
    ? { ...synthesizePetdexAnimations(columns, frameCount), ...animations }
    : synthesizePetdexAnimations(columns, frameCount);

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

    return {
      skin: {
        manifest: normalized.manifest,
        spritesheetUrl: options.makeFileUrl(normalized.spritesheetPath),
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
```


- [ ] **Step 5: Run the service test and verify GREEN**

Run:

```powershell
npm test -- tests/unit/petSkinService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/main/services/petSkinService.ts src/main/appPaths.ts tests/unit/petSkinService.test.ts
git commit -m "feat: add pet skin service"
```

## Task 3: Skin IPC, Preload API, and Main Wiring

**Files:**
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/registerCoreIpc.ts`
- Modify: `src/main/app.ts`
- Test: `tests/unit/registerCoreIpc.petSkin.test.ts`

- [ ] **Step 1: Write the failing IPC tests**

Create `tests/unit/registerCoreIpc.petSkin.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreIpc } from "../../src/main/ipc/registerCoreIpc";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { ipcChannels } from "../../src/shared/ipcChannels";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, payload?: unknown) => unknown>();
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const settingsWindow = {};

  return {
    handlers,
    sent,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: { sender: unknown }, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    dialog: {
      showOpenDialog: vi.fn(),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => settingsWindow),
      getAllWindows: vi.fn(() => [{
        webContents: {
          send: vi.fn((channel: string, payload: unknown) => sent.push({ channel, payload })),
        },
      }]),
    },
    screen: {
      getAllDisplays: vi.fn(() => []),
      getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } })),
      getDisplayNearestPoint: vi.fn(() => ({ id: 1 })),
      getPrimaryDisplay: vi.fn(() => ({ id: 1, bounds: { x: 0, y: 0, width: 800, height: 600 } })),
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  dialog: electronMock.dialog,
  ipcMain: electronMock.ipcMain,
  screen: electronMock.screen,
}));

const skinResult = {
  skin: {
    manifest: {
      id: "mint",
      displayName: "Mint",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///D:/pets/mint/spritesheet.webp",
    sourcePath: "D:/pets/mint",
    source: "local",
  },
  fallbackUsed: false,
};

function createDeps() {
  return {
    configService: {
      getConfig: vi.fn(() => defaultAppConfig),
      setConfig: vi.fn((update) => ({ ...defaultAppConfig, ...update, pet: { ...defaultAppConfig.pet, ...update.pet } })),
    },
    petSkinService: {
      getCurrentSkin: vi.fn(() => skinResult),
      importSkinFolder: vi.fn(() => skinResult),
      resetSkin: vi.fn(() => ({ ...skinResult, skin: { ...skinResult.skin, source: "bundled", sourcePath: undefined } })),
      openPetdex: vi.fn(),
    },
    pluginRegistry: {
      getMenuItems: vi.fn(() => []),
      getContributions: vi.fn(() => ({ menuItems: [], shortcuts: [], settingsSections: [], panels: [], plugins: [] })),
    },
    invokePluginAction: vi.fn(),
    onConfigChanged: vi.fn(),
  };
}

describe("pet skin IPC", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.sent.length = 0;
    vi.clearAllMocks();
  });

  it("registers skin channels and returns the current skin", () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    expect(electronMock.handlers.get(ipcChannels.petSkinGetCurrent)?.({ sender: {} })).toEqual(skinResult);
  });

  it("imports a selected skin folder, persists config, and broadcasts the skin change", async () => {
    electronMock.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["D:/pets/mint"] });
    const deps = createDeps();
    registerCoreIpc(deps as never);

    await expect(electronMock.handlers.get(ipcChannels.petSkinImportFolder)?.({ sender: {} })).resolves.toEqual(skinResult);

    expect(deps.petSkinService.importSkinFolder).toHaveBeenCalledWith("D:/pets/mint");
    expect(deps.configService.setConfig).toHaveBeenCalledWith({ pet: { skinSourcePath: "D:/pets/mint" } });
    expect(electronMock.sent).toContainEqual({ channel: ipcChannels.petSkinChanged, payload: skinResult });
  });

  it("returns undefined when folder selection is canceled", async () => {
    electronMock.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const deps = createDeps();
    registerCoreIpc(deps as never);

    await expect(electronMock.handlers.get(ipcChannels.petSkinImportFolder)?.({ sender: {} })).resolves.toBeUndefined();
    expect(deps.petSkinService.importSkinFolder).not.toHaveBeenCalled();
  });

  it("resets the skin and opens Petdex", async () => {
    const deps = createDeps();
    registerCoreIpc(deps as never);

    await electronMock.handlers.get(ipcChannels.petSkinReset)?.({ sender: {} });
    await electronMock.handlers.get(ipcChannels.petSkinOpenPetdex)?.({ sender: {} });

    expect(deps.petSkinService.resetSkin).toHaveBeenCalledTimes(1);
    expect(deps.configService.setConfig).toHaveBeenCalledWith({ pet: { skinSourcePath: "" } });
    expect(deps.petSkinService.openPetdex).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the IPC test and verify RED**

Run:

```powershell
npm test -- tests/unit/registerCoreIpc.petSkin.test.ts
```

Expected: FAIL because skin IPC channels and `petSkinService` dependency do not exist.

- [ ] **Step 3: Add IPC channel constants**

Update `src/shared/ipcChannels.ts` in the pet section:

```ts
petSkinGetCurrent: "pet:skin:get-current",
petSkinImportFolder: "pet:skin:import-folder",
petSkinReset: "pet:skin:reset",
petSkinOpenPetdex: "pet:skin:open-petdex",
petSkinChanged: "pet:skin:changed",
```

- [ ] **Step 4: Extend preload API types**

Update `src/preload/api.ts`:

```ts
import type { PetSkinLoadResult } from "../shared/petManifest.js";
```

Add these members under `pet?:`:

```ts
getCurrentSkin(): Promise<PetSkinLoadResult>;
importSkinFolder(): Promise<PetSkinLoadResult | undefined>;
resetSkin(): Promise<PetSkinLoadResult>;
openPetdex(): Promise<void>;
onSkinChanged(callback: (result: PetSkinLoadResult) => void): () => void;
```

- [ ] **Step 5: Wire preload implementation**

Update `src/preload/index.ts` inside `pet`:

```ts
getCurrentSkin: () => ipcRenderer.invoke(ipcChannels.petSkinGetCurrent),
importSkinFolder: () => ipcRenderer.invoke(ipcChannels.petSkinImportFolder),
resetSkin: () => ipcRenderer.invoke(ipcChannels.petSkinReset),
openPetdex: () => ipcRenderer.invoke(ipcChannels.petSkinOpenPetdex),
onSkinChanged: (callback) => {
  const listener = (_event: IpcRendererEvent, result: unknown) => callback(result as never);
  ipcRenderer.on(ipcChannels.petSkinChanged, listener);
  return () => ipcRenderer.removeListener(ipcChannels.petSkinChanged, listener);
},
```

- [ ] **Step 6: Register main IPC handlers**

Update `src/main/ipc/registerCoreIpc.ts`:

```ts
import type { PetSkinService } from "../services/petSkinService.js";
```

Add to `CoreIpcDependencies`:

```ts
petSkinService?: PetSkinService;
```

Add helper inside `registerCoreIpc`:

```ts
function broadcastPetSkinChanged(result: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(ipcChannels.petSkinChanged, result);
  });
}
```

Add handlers near other pet handlers:

```ts
ipcMain.handle(ipcChannels.petSkinGetCurrent, () => deps.petSkinService?.getCurrentSkin());
ipcMain.handle(ipcChannels.petSkinImportFolder, async (event) => {
  if (!deps.petSkinService) {
    throw new Error("宠物皮肤服务未就绪");
  }

  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: "选择宠物皮肤文件夹",
    properties: ["openDirectory"],
  };
  const selection = browserWindow
    ? await dialog.showOpenDialog(browserWindow, options)
    : await dialog.showOpenDialog(options);

  if (selection.canceled || !selection.filePaths[0]) {
    return undefined;
  }

  const result = deps.petSkinService.importSkinFolder(selection.filePaths[0]);
  if (!result.fallbackUsed) {
    const nextConfig = deps.configService.setConfig({ pet: { skinSourcePath: selection.filePaths[0] } });
    deps.onConfigChanged?.(nextConfig);
  }
  broadcastPetSkinChanged(result);
  return result;
});
ipcMain.handle(ipcChannels.petSkinReset, () => {
  if (!deps.petSkinService) {
    throw new Error("宠物皮肤服务未就绪");
  }

  const result = deps.petSkinService.resetSkin();
  const nextConfig = deps.configService.setConfig({ pet: { skinSourcePath: "" } });
  deps.onConfigChanged?.(nextConfig);
  broadcastPetSkinChanged(result);
  return result;
});
ipcMain.handle(ipcChannels.petSkinOpenPetdex, () => deps.petSkinService?.openPetdex());
```

- [ ] **Step 7: Instantiate service in `app.ts`**

Update imports in `src/main/app.ts`:

```ts
import { pathToFileURL } from "node:url";
import { shell } from "electron";
import { createPetSkinService } from "./services/petSkinService.js";
```

If `shell` is merged into the existing Electron import, use:

```ts
import { app, BrowserWindow, Menu, Tray, nativeImage, safeStorage, shell } from "electron";
```

Create the service after `configService`:

```ts
const petSkinService = createPetSkinService({
  getConfig: () => configService.getConfig(),
  bundledManifestPath: appPaths.bundledPetManifestPath,
  bundledSpritesheetPath: appPaths.bundledPetSpritesheetPath,
  readImageSize(path) {
    return nativeImage.createFromPath(path).getSize();
  },
  makeFileUrl(path) {
    return pathToFileURL(path).toString();
  },
  openExternal(url) {
    return shell.openExternal(url);
  },
});
```

Pass `petSkinService` into `registerCoreIpc`.

- [ ] **Step 8: Run IPC tests and verify GREEN**

Run:

```powershell
npm test -- tests/unit/registerCoreIpc.petSkin.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/shared/ipcChannels.ts src/preload/api.ts src/preload/index.ts src/main/ipc/registerCoreIpc.ts src/main/app.ts tests/unit/registerCoreIpc.petSkin.test.ts
git commit -m "feat: expose pet skin ipc"
```

## Task 4: Settings UI Skin Controls

**Files:**
- Modify: `src/renderer/shell/SettingsApp.tsx`
- Modify: `src/renderer/shell/SettingsApp.css`
- Test: `tests/renderer/SettingsApp.test.tsx`

- [ ] **Step 1: Write failing Settings tests**

In `tests/renderer/SettingsApp.test.tsx`, add `getCurrentSkin`, `importSkinFolder`, `resetSkin`, and `openPetdex` mocks to the `pet` API object:

```ts
const getCurrentSkin = vi.fn();
const importSkinFolder = vi.fn();
const resetSkin = vi.fn();
const openPetdex = vi.fn();
```

Set defaults in `beforeEach`:

```ts
getCurrentSkin.mockResolvedValue({
  skin: {
    manifest: {
      id: "lacritomato-mini",
      displayName: "LacriTomato Mini",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///assets/pet/spritesheet.webp",
    source: "bundled",
  },
  fallbackUsed: false,
});
importSkinFolder.mockResolvedValue({
  skin: {
    manifest: {
      id: "mint",
      displayName: "Mint",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///D:/pets/mint/spritesheet.webp",
    sourcePath: "D:/pets/mint",
    source: "local",
  },
  fallbackUsed: false,
});
resetSkin.mockResolvedValue({ skin: { manifest: { id: "lacritomato-mini", displayName: "LacriTomato Mini", spritesheetPath: "spritesheet.webp", frameWidth: 192, frameHeight: 208, columns: 8, rows: 9, animations: { idle: { frames: [0], fps: 6, loop: true } } }, spritesheetUrl: "file:///assets/pet/spritesheet.webp", source: "bundled" }, fallbackUsed: false });
openPetdex.mockResolvedValue(undefined);
```

Add `pet` under `window.petdex`:

```ts
pet: {
  getCurrentSkin,
  importSkinFolder,
  resetSkin,
  openPetdex,
  onSkinChanged: vi.fn(),
} as never,
```

Add a test:

```ts
it("shows pet skin controls and imports a selected skin", async () => {
  render(<SettingsApp />);

  fireEvent.click(await screen.findByRole("button", { name: "桌宠" }));

  expect(await screen.findByText("当前皮肤")).toBeTruthy();
  expect(screen.getByText("LacriTomato Mini")).toBeTruthy();
  expect(screen.getByText("内置皮肤")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "导入皮肤文件夹" }));

  expect(await screen.findByText("Mint")).toBeTruthy();
  expect(importSkinFolder).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(showTip).toHaveBeenCalledWith("皮肤已切换为 Mint"));
});
```

Add a second test:

```ts
it("opens Petdex and resets the active skin", async () => {
  render(<SettingsApp />);
  fireEvent.click(await screen.findByRole("button", { name: "桌宠" }));

  fireEvent.click(await screen.findByRole("button", { name: "打开 Petdex" }));
  fireEvent.click(screen.getByRole("button", { name: "恢复默认皮肤" }));

  expect(openPetdex).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(resetSkin).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run Settings tests and verify RED**

Run:

```powershell
npm test -- tests/renderer/SettingsApp.test.tsx
```

Expected: FAIL because skin controls do not render.

- [ ] **Step 3: Add Settings state and handlers**

Update `src/renderer/shell/SettingsApp.tsx` imports:

```ts
import type { PetSkinLoadResult } from "../../shared/petManifest";
```

Add state:

```ts
const [petSkin, setPetSkin] = useState<PetSkinLoadResult | undefined>();
```

Add `api.pet?.getCurrentSkin().catch(() => undefined)` to the initial `Promise.all`, then set it in `.then(...)`:

```ts
api.pet?.getCurrentSkin?.().catch(() => undefined),
```

and:

```ts
setPetSkin(nextPetSkin);
```

Add handlers:

```ts
async function importPetSkin() {
  const api = window.petdex;
  if (!api?.pet?.importSkinFolder) {
    void showSettingsTip(disconnectedMessage);
    return;
  }

  try {
    const result = await api.pet.importSkinFolder();
    if (!result) {
      return;
    }
    setPetSkin(result);
    const name = result.skin.manifest.displayName;
    void showSettingsTip(result.warning ?? `皮肤已切换为 ${name}`);
  } catch (error) {
    void showSettingsTip(getErrorMessage(error, "导入皮肤失败"));
  }
}

async function resetPetSkin() {
  const api = window.petdex;
  if (!api?.pet?.resetSkin) {
    void showSettingsTip(disconnectedMessage);
    return;
  }

  try {
    const result = await api.pet.resetSkin();
    setPetSkin(result);
    void showSettingsTip("已恢复默认皮肤");
  } catch (error) {
    void showSettingsTip(getErrorMessage(error, "恢复默认皮肤失败"));
  }
}

async function openPetdex() {
  const api = window.petdex;
  if (!api?.pet?.openPetdex) {
    void showSettingsTip(disconnectedMessage);
    return;
  }

  try {
    await api.pet.openPetdex();
  } catch (error) {
    void showSettingsTip(getErrorMessage(error, "打开 Petdex 失败"));
  }
}
```

- [ ] **Step 4: Render skin controls in the pet section**

Insert after `<h1 id="settings-pet-heading">桌宠</h1>`:

```tsx
<section className="settings-skin-panel" aria-label="宠物皮肤">
  <div>
    <span className="settings-skin-label">当前皮肤</span>
    <strong>{petSkin?.skin.manifest.displayName ?? "LacriTomato Mini"}</strong>
  </div>
  <div className="settings-skin-meta">
    {petSkin?.skin.source === "local" ? petSkin.skin.sourcePath : "内置皮肤"}
  </div>
  {petSkin?.warning && <p className="settings-field-note">{petSkin.warning}</p>}
  <p className="settings-field-note">
    可在 Petdex 选择喜欢的宠物，使用 npx petdex install &lt;slug&gt; 下载后，选择包含 pet.json 和 spritesheet.webp/png 的文件夹。
  </p>
  <div className="settings-action-row">
    <button type="button" className="settings-secondary" onClick={() => void importPetSkin()}>导入皮肤文件夹</button>
    <button type="button" className="settings-secondary" onClick={() => void openPetdex()}>打开 Petdex</button>
    <button type="button" className="settings-secondary" onClick={() => void resetPetSkin()}>恢复默认皮肤</button>
  </div>
</section>
```

- [ ] **Step 5: Add skin styles**

Append to `src/renderer/shell/SettingsApp.css`:

```css
.settings-skin-panel {
  display: grid;
  gap: 8px;
  padding: 14px;
  background: #151820;
  border: 1px solid #303541;
  border-radius: 8px;
}

.settings-skin-label {
  display: block;
  margin-bottom: 4px;
  color: #aeb6c5;
  font-size: 12px;
}

.settings-skin-meta {
  overflow-wrap: anywhere;
  color: #d7deeb;
  font-size: 13px;
}
```

- [ ] **Step 6: Run Settings tests and verify GREEN**

Run:

```powershell
npm test -- tests/renderer/SettingsApp.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/shell/SettingsApp.tsx src/renderer/shell/SettingsApp.css tests/renderer/SettingsApp.test.tsx
git commit -m "feat: add pet skin settings controls"
```

## Task 5: PetApp Runtime Skin Loading

**Files:**
- Modify: `src/renderer/shell/PetApp.tsx`
- Test: `tests/renderer/PetApp.test.tsx`

- [ ] **Step 1: Write failing PetApp tests**

In `tests/renderer/PetApp.test.tsx`, add:

```ts
let skinChangedFromMain: ((result: unknown) => void) | undefined;
const skinResult = {
  skin: {
    manifest: {
      id: "mint",
      displayName: "Mint",
      spritesheetPath: "spritesheet.webp",
      frameWidth: 100,
      frameHeight: 200,
      columns: 2,
      rows: 1,
      animations: { idle: { frames: [0], fps: 6, loop: true } },
    },
    spritesheetUrl: "file:///D:/pets/mint/spritesheet.webp",
    sourcePath: "D:/pets/mint",
    source: "local",
  },
  fallbackUsed: false,
};
```

Add mocks under `api.pet`:

```ts
getCurrentSkin: vi.fn(),
importSkinFolder: vi.fn(),
resetSkin: vi.fn(),
openPetdex: vi.fn(),
onSkinChanged: vi.fn((callback: (result: unknown) => void) => {
  skinChangedFromMain = callback;
  return vi.fn();
}),
```

Set default in `beforeEach`:

```ts
api.pet.getCurrentSkin.mockResolvedValue(undefined);
skinChangedFromMain = undefined;
```

Add tests:

```ts
it("loads a runtime pet skin and sizes the body from its manifest", async () => {
  api.pet.getCurrentSkin.mockResolvedValueOnce(skinResult);

  const { container } = await renderPetApp();

  await waitFor(() => expect(api.pet.getCurrentSkin).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenLastCalledWith(112, 224));
  expect(container.querySelector<HTMLElement>(".pet-sprite")?.style.backgroundImage).toContain("mint/spritesheet.webp");
});

it("applies skin changed events without restarting the pet", async () => {
  const { container } = await renderPetApp();

  act(() => {
    skinChangedFromMain?.(skinResult);
  });

  await waitFor(() => expect(api.pet.syncBodySize).toHaveBeenLastCalledWith(112, 224));
  expect(container.querySelector<HTMLElement>(".pet-sprite")?.style.backgroundImage).toContain("mint/spritesheet.webp");
});
```

- [ ] **Step 2: Run PetApp tests and verify RED**

Run:

```powershell
npm test -- tests/renderer/PetApp.test.tsx
```

Expected: FAIL because `PetApp` does not call `getCurrentSkin` and still hardcodes the bundled manifest.

- [ ] **Step 3: Add fallback skin constants and state**

Update `src/renderer/shell/PetApp.tsx` imports:

```ts
import type { PetManifest, PetSkinLoadResult } from "../../shared/petManifest";
```

Replace existing constants:

```ts
const fallbackManifest = petManifest as PetManifest;
const fallbackSpritesheetUrl = "../../assets/pet/spritesheet.webp";
```

Inside `PetApp`, add:

```ts
const [skin, setSkin] = useState(() => ({
  manifest: fallbackManifest,
  spritesheetUrl: fallbackSpritesheetUrl,
}));
const activeManifest = skin.manifest;
```

Replace all `manifest.` reads inside `PetApp` with `activeManifest.`.

- [ ] **Step 4: Make animation lookup runtime-aware**

Replace `getAnimation(name: PetAnimationName)` with:

```ts
function getAnimation(manifest: PetManifest, name: PetAnimationName) {
  return manifest.animations[name] ?? manifest.animations.idle ?? { frames: [0], fps: 6, loop: true };
}
```

Update useMemo:

```ts
const currentAnimation = useMemo(() => getAnimation(activeManifest, displayAnimation), [activeManifest, displayAnimation]);
```

- [ ] **Step 5: Load and subscribe to current skin**

Add helper inside `PetApp`:

```ts
function applySkinResult(result: PetSkinLoadResult | undefined) {
  if (!result?.skin) {
    return;
  }

  setSkin({
    manifest: result.skin.manifest,
    spritesheetUrl: result.skin.spritesheetUrl,
  });

  if (result.warning) {
    applyBubble({ text: result.warning, emotion: "thinking", durationMs: 2600 });
  }
}
```

Add effects:

```ts
useEffect(() => {
  let active = true;

  void window.petdex?.pet?.getCurrentSkin?.()
    .then((result) => {
      if (active) {
        applySkinResult(result);
      }
    })
    .catch(() => undefined);

  return () => {
    active = false;
  };
}, [applyBubble]);

useEffect(() => {
  return window.petdex?.pet?.onSkinChanged?.((result) => {
    applySkinResult(result);
  });
}, [applyBubble]);
```

If `applySkinResult` needs stable identity, wrap it in `useCallback` with `[applyBubble]`.

- [ ] **Step 6: Use runtime skin in sizing and sprite render**

Update calculations:

```ts
const frameIndex = currentAnimation.frames[safeFrame] ?? activeManifest.animations.idle?.frames[0] ?? 0;
const spriteWidth = (activeManifest.frameWidth * displayHeight) / activeManifest.frameHeight;
```

Update `PetSprite` props:

```tsx
<PetSprite
  spritesheetUrl={skin.spritesheetUrl}
  frameWidth={activeManifest.frameWidth}
  frameHeight={activeManifest.frameHeight}
  frameIndex={frameIndex}
  columns={activeManifest.columns}
  displayHeight={displayHeight}
  animationName={displayAnimation}
/>
```

Update `openMenu` width calculation to use `activeManifest`.

- [ ] **Step 7: Run PetApp tests and verify GREEN**

Run:

```powershell
npm test -- tests/renderer/PetApp.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/renderer/shell/PetApp.tsx tests/renderer/PetApp.test.tsx
git commit -m "feat: load pet skins at runtime"
```

## Task 6: Integration Typecheck and Focused Test Suite

**Files:**
- Verify only.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm test -- tests/unit/petSkinService.test.ts tests/unit/registerCoreIpc.petSkin.test.ts tests/unit/configSchema.test.ts tests/unit/configService.test.ts tests/renderer/SettingsApp.test.tsx tests/renderer/PetApp.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Fix any type or integration failures using TDD discipline**

If a failure is behavioral, first add or adjust a focused failing test that describes the desired behavior. Then make the minimal code change and rerun the focused test. If a failure is a pure TypeScript wiring issue, fix the type mismatch directly and rerun `npm run typecheck`.

- [ ] **Step 4: Commit verification fixes if any**

If files changed:

```powershell
git add src/shared/petManifest.ts src/shared/configSchema.ts src/shared/ipcChannels.ts src/preload/api.ts src/preload/index.ts src/main/appPaths.ts src/main/services/petSkinService.ts src/main/ipc/registerCoreIpc.ts src/main/app.ts src/renderer/shell/SettingsApp.tsx src/renderer/shell/SettingsApp.css src/renderer/shell/PetApp.tsx tests/unit/configSchema.test.ts tests/unit/configService.test.ts tests/unit/petSkinService.test.ts tests/unit/registerCoreIpc.petSkin.test.ts tests/renderer/SettingsApp.test.tsx tests/renderer/PetApp.test.tsx
git commit -m "fix: stabilize pet skin integration"
```

If no files changed, do not create a commit.

## Task 7: Documentation Touch-Up

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the failing documentation check**

Run:

```powershell
rg -n "皮肤|Petdex|npx petdex install" README.md
```

Expected: FAIL or no output because README does not mention skin switching yet.

- [ ] **Step 2: Add README feature and usage notes**

Update the feature list in `README.md` with:

```md
- 宠物换肤：可从 Petdex 下载兼容宠物文件夹，在设置页导入 `pet.json + spritesheet.webp/png` 后切换当前桌宠皮肤。
```

Add a short usage note near "模型与数据":

```md
## 宠物皮肤

可在 [Petdex](https://petdex.dev/) 浏览宠物，使用 `npx petdex install <slug>` 下载到本机后，在设置页的「桌宠」分区选择包含 `pet.json` 和 `spritesheet.webp` 或 `spritesheet.png` 的文件夹。导入失败时应用会保留内置 LacriTomato Mini 皮肤。
```

- [ ] **Step 3: Verify documentation**

Run:

```powershell
rg -n "皮肤|Petdex|npx petdex install" README.md
```

Expected: output includes the new feature line and "宠物皮肤" section.

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: document pet skin import"
```

## Final Verification

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only pre-existing unrelated files remain, currently `tools/recording/wasapi-loopback-helper/obj/`.

## Self-Review Results

Spec coverage:

- Local folder import: Tasks 2, 3, and 4.
- Native and Petdex manifest support: Task 2.
- Persistence through config: Tasks 1 and 3.
- Renderer file-access boundary: Tasks 3, 4, and 5.
- Fallback behavior: Tasks 2 and 5.
- Petdex discovery button: Tasks 3 and 4.
- Tests for validation, config, IPC, Settings, and PetApp: Tasks 1 through 5.

Completion scan:

- No incomplete markers are intentionally left in this plan.
- Every implementation task includes concrete files, test snippets, implementation snippets, commands, and expected results.

Type consistency:

- Shared type name is `PetSkinLoadResult`.
- Config key is `pet.skinSourcePath`.
- IPC keys are `petSkinGetCurrent`, `petSkinImportFolder`, `petSkinReset`, `petSkinOpenPetdex`, and `petSkinChanged`.
- Renderer API methods are `getCurrentSkin`, `importSkinFolder`, `resetSkin`, `openPetdex`, and `onSkinChanged`.



