# LacriTomato Desktop Pet Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first Electron desktop pet platform for LacriTomato Mini with an animated pet-head function menu, translation plugin, screenshot/OCR plugin, settings, secure model configuration, and plugin-ready architecture.

**Architecture:** Electron main process owns native capabilities, secure config, global shortcuts, screenshots, windows, and plugin registration. Renderer apps are isolated UI surfaces exposed through typed preload APIs. Translator and screenshot are built as controlled built-in plugins that contribute menu actions, settings sections, shortcuts, and panels.

**Tech Stack:** Electron, Vite, React, TypeScript, Vitest, Zod, Lucide React, Tesseract.js, Electron safeStorage, Canvas-based pet animation and screenshot annotation.

---

## Scope Note

This project has several subsystems. This plan keeps them in one sequence because the first working product needs the platform shell, pet entry point, settings, translation, and screenshot flow to cooperate. Rolling screenshot and full chat are explicitly out of first-release scope; their interfaces are created as stable extension points only.

## File Structure Map

- Create: `package.json` - scripts, Electron app metadata, dependencies.
- Create: `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts` - build and test configuration.
- Create: `index.html` - renderer entry document.
- Move: `pet.json` to `assets/pet/pet.json` and `spritesheet.webp` to `assets/pet/spritesheet.webp`.
- Create: `src/shared/pluginTypes.ts` - plugin manifest and contribution contracts.
- Create: `src/shared/configSchema.ts` - Zod schemas and defaults.
- Create: `src/shared/ipcChannels.ts` - IPC channel constants.
- Create: `src/shared/languages.ts` - language options and defaults.
- Create: `src/shared/petManifest.ts` - pet animation manifest types.
- Create: `src/main/app.ts` - Electron app bootstrap.
- Create: `src/main/windows/*.ts` - window factories for pet, settings, translator, screenshot overlay, pinned image.
- Create: `src/main/services/*.ts` - config, model, shortcut, screenshot, OCR, pet behavior, plugin registry.
- Create: `src/main/ipc/*.ts` - core and plugin IPC registration.
- Create: `src/preload/index.ts`, `src/preload/api.ts` - secure renderer bridge.
- Create: `src/renderer/main.tsx`, `src/renderer/router.tsx` - renderer boot and route selection.
- Create: `src/renderer/shell/PetApp.tsx`, `SettingsApp.tsx` - platform UI shells.
- Create: `src/renderer/components/*.tsx` - reusable controls.
- Create: `src/plugins/translator/*` - translator plugin manifest, main handlers, renderer panel, settings.
- Create: `src/plugins/screenshot/*` - screenshot plugin manifest, main handlers, overlay/editor/settings.
- Create: `tests/unit/*.test.ts`, `tests/renderer/*.test.tsx` - service and renderer tests.

---

### Task 1: Initialize Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/renderer/main.tsx`

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json`:

```json
{
  "name": "lacritomato-mini-petdex",
  "version": "0.1.0",
  "private": true,
  "description": "LacriTomato Mini Windows desktop pet platform",
  "main": "dist/main/app.js",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build:renderer": "vite build",
    "build:main": "tsc -p tsconfig.node.json",
    "build": "npm run build:renderer && npm run build:main",
    "start": "npm run build && electron .",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "npm run build && electron-builder --win nsis"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "electron": "^36.0.0",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tesseract.js": "^6.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "electron-builder": "^26.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  },
  "build": {
    "appId": "com.lacritomato.petdex",
    "productName": "LacriTomato Mini",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "assets/**/*",
      "package.json"
    ],
    "win": {
      "target": "nsis"
    }
  }
}
```

- [ ] **Step 2: Create TypeScript configs**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/renderer", "src/shared", "src/plugins", "tests"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/main", "src/preload", "src/shared", "src/plugins"]
}
```

- [ ] **Step 3: Create Vite and Vitest config**

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: Create renderer entry**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LacriTomato Mini</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";

function BootScreen() {
  return <div data-testid="boot">LacriTomato Mini</div>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BootScreen />
  </React.StrictMode>,
);
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

Expected: dependencies install successfully and `package-lock.json` is created.

- [ ] **Step 6: Run verification**

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

Run: `npm test`

Expected: Vitest exits with code 0 and reports no tests found only if no test files exist yet.

- [ ] **Step 7: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts index.html src/renderer/main.tsx
git commit -m "chore: scaffold electron react project"
```

---

### Task 2: Add Shared Contracts and Config Defaults

**Files:**
- Create: `src/shared/pluginTypes.ts`
- Create: `src/shared/configSchema.ts`
- Create: `src/shared/ipcChannels.ts`
- Create: `src/shared/languages.ts`
- Create: `src/shared/petManifest.ts`
- Test: `tests/unit/configSchema.test.ts`
- Test: `tests/unit/pluginTypes.test.ts`

- [ ] **Step 1: Write config schema test**

Create `tests/unit/configSchema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { appConfigSchema, defaultAppConfig } from "../../src/shared/configSchema";

describe("config schema", () => {
  it("accepts default app config", () => {
    expect(() => appConfigSchema.parse(defaultAppConfig)).not.toThrow();
  });

  it("uses recommended shortcut defaults", () => {
    expect(defaultAppConfig.shortcuts.captureArea).toBe("CommandOrControl+Shift+A");
    expect(defaultAppConfig.shortcuts.captureOcr).toBe("CommandOrControl+Shift+O");
  });

  it("uses accepted pet default size", () => {
    expect(defaultAppConfig.pet.defaultHeight).toBe(224);
  });
});
```

- [ ] **Step 2: Write plugin contract test**

Create `tests/unit/pluginTypes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PetdexPluginManifest } from "../../src/shared/pluginTypes";

describe("plugin manifest contract", () => {
  it("supports menu, shortcut, settings, panels, and capabilities", () => {
    const manifest: PetdexPluginManifest = {
      id: "translator",
      name: "Translator",
      version: "0.1.0",
      menuItems: [{ id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" }],
      shortcuts: [{ id: "quickTranslate", label: "打开翻译", defaultAccelerator: "CommandOrControl+Shift+T" }],
      settingsSections: [{ id: "translator.settings", label: "翻译", rendererRoute: "translator-settings" }],
      panels: [{ id: "translator.panel", rendererRoute: "translator-panel", title: "翻译" }],
      capabilities: ["model:text"],
    };

    expect(manifest.menuItems[0].action).toBe("translator.open");
    expect(manifest.capabilities).toContain("model:text");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/unit/configSchema.test.ts tests/unit/pluginTypes.test.ts`

Expected: FAIL because shared modules do not exist.

- [ ] **Step 4: Implement plugin types**

Create `src/shared/pluginTypes.ts`:

```ts
export type PluginCapability =
  | "model:text"
  | "model:vision"
  | "screen:capture"
  | "clipboard:text"
  | "clipboard:image"
  | "file:save"
  | "ocr:local"
  | "pet:behavior";

export interface PluginMenuItem {
  id: string;
  label: string;
  action: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
}

export interface PluginShortcutContribution {
  id: string;
  label: string;
  defaultAccelerator: string;
}

export interface PluginSettingsSection {
  id: string;
  label: string;
  rendererRoute: string;
}

export interface PluginPanelContribution {
  id: string;
  title: string;
  rendererRoute: string;
}

export interface PetdexPluginManifest {
  id: string;
  name: string;
  version: string;
  menuItems: PluginMenuItem[];
  shortcuts?: PluginShortcutContribution[];
  settingsSections?: PluginSettingsSection[];
  panels?: PluginPanelContribution[];
  capabilities: PluginCapability[];
}
```

- [ ] **Step 5: Implement config schema**

Create `src/shared/configSchema.ts`:

```ts
import { z } from "zod";

export const modelConfigSchema = z.object({
  baseURL: z.string().default("https://api.deepseek.com"),
  model: z.string().default("deepseek-flash"),
  temperature: z.number().min(0).max(2).default(0.2),
  timeoutMs: z.number().int().positive().default(60000),
});

export const appConfigSchema = z.object({
  model: modelConfigSchema,
  shortcuts: z.object({
    captureArea: z.string(),
    captureOcr: z.string(),
    openTranslator: z.string(),
    quickTranslateSelection: z.string(),
    togglePet: z.string(),
  }),
  translator: z.object({
    defaultSourceLanguage: z.string(),
    defaultTargetLanguages: z.array(z.string()),
    historyLimit: z.number().int().min(0).max(100),
  }),
  screenshot: z.object({
    hidePetWhenCapturing: z.boolean(),
    saveDirectoryName: z.string(),
    filenamePattern: z.string(),
    enableScrollingCaptureExperiment: z.boolean(),
  }),
  ocr: z.object({
    mode: z.enum(["local", "model"]),
    languages: z.array(z.string()),
    sendToTranslatorAfterRecognize: z.boolean(),
  }),
  pet: z.object({
    defaultHeight: z.number().int().min(96).max(480),
    opacity: z.number().min(0.3).max(1),
    alwaysOnTop: z.boolean(),
    wanderEnabled: z.boolean(),
    animationSpeed: z.number().min(0.5).max(2),
  }),
  plugins: z.record(z.boolean()),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const defaultAppConfig: AppConfig = {
  model: {
    baseURL: "https://api.deepseek.com",
    model: "deepseek-flash",
    temperature: 0.2,
    timeoutMs: 60000,
  },
  shortcuts: {
    captureArea: "CommandOrControl+Shift+A",
    captureOcr: "CommandOrControl+Shift+O",
    openTranslator: "CommandOrControl+Shift+T",
    quickTranslateSelection: "CommandOrControl+Shift+Y",
    togglePet: "CommandOrControl+Shift+P",
  },
  translator: {
    defaultSourceLanguage: "auto",
    defaultTargetLanguages: ["zh-CN", "en", "ja"],
    historyLimit: 20,
  },
  screenshot: {
    hidePetWhenCapturing: true,
    saveDirectoryName: "screenshots",
    filenamePattern: "lacritomato-yyyyMMdd-HHmmss",
    enableScrollingCaptureExperiment: true,
  },
  ocr: {
    mode: "local",
    languages: ["chi_sim", "eng"],
    sendToTranslatorAfterRecognize: false,
  },
  pet: {
    defaultHeight: 224,
    opacity: 1,
    alwaysOnTop: true,
    wanderEnabled: true,
    animationSpeed: 1,
  },
  plugins: {
    translator: true,
    screenshot: true,
  },
};
```

- [ ] **Step 6: Implement channels, languages, pet manifest types**

Create `src/shared/ipcChannels.ts`:

```ts
export const ipcChannels = {
  configGet: "core:config:get",
  configSet: "core:config:set",
  secureConfigSetApiKey: "core:secure-config:set-api-key",
  modelTranslate: "core:model:translate",
  ocrRecognize: "core:ocr:recognize",
  pluginListMenuItems: "core:plugin:list-menu-items",
  pluginInvokeAction: "core:plugin:invoke-action",
  screenshotStartCapture: "plugin:screenshot:start-capture",
  screenshotSaveCapture: "plugin:screenshot:save-capture",
} as const;
```

Create `src/shared/languages.ts`:

```ts
export interface LanguageOption {
  code: string;
  label: string;
}

export const sourceLanguages: LanguageOption[] = [
  { code: "auto", label: "自动检测" },
  { code: "zh-CN", label: "中文" },
  { code: "en", label: "英文" },
  { code: "ja", label: "日文" },
  { code: "ko", label: "韩文" },
  { code: "fr", label: "法文" },
  { code: "de", label: "德文" },
  { code: "es", label: "西班牙文" },
];

export const targetLanguages = sourceLanguages.filter((item) => item.code !== "auto");
```

Create `src/shared/petManifest.ts`:

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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/unit/configSchema.test.ts tests/unit/pluginTypes.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared tests/unit
git commit -m "feat: add shared platform contracts"
```

---

### Task 3: Normalize Pet Assets and Animation Manifest

**Files:**
- Modify: `pet.json`
- Create: `assets/pet/pet.json`
- Move: `spritesheet.webp` to `assets/pet/spritesheet.webp`
- Test: `tests/unit/petManifest.test.ts`

- [ ] **Step 1: Write pet manifest test**

Create `tests/unit/petManifest.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/petManifest.test.ts`

Expected: FAIL because `assets/pet/pet.json` does not exist.

- [ ] **Step 3: Move assets**

Run: `New-Item -ItemType Directory -Force .\assets\pet`

Run: `Move-Item .\spritesheet.webp .\assets\pet\spritesheet.webp`

- [ ] **Step 4: Create expanded pet manifest**

Create `assets/pet/pet.json`:

```json
{
  "id": "lacritomato-mini",
  "displayName": "LacriTomato Mini",
  "description": "A small red-black cyber anime desktop pet with split black-and-white hair, red eyes, ribbon ear silhouette, and a tomato-heart charm.",
  "spritesheetPath": "spritesheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "columns": 8,
  "rows": 9,
  "animations": {
    "idle": { "frames": [0, 1, 2, 3, 4, 5], "fps": 6, "loop": true },
    "walkRight": { "frames": [8, 9, 10, 11, 12, 13, 14, 15], "fps": 9, "loop": true },
    "walkLeft": { "frames": [16, 17, 18, 19, 20, 21, 22, 23], "fps": 9, "loop": true },
    "attentive": { "frames": [24, 25, 26, 27], "fps": 7, "loop": false },
    "happy": { "frames": [24, 25, 26, 27], "fps": 7, "loop": false },
    "sleepy": { "frames": [40, 41, 42, 43], "fps": 4, "loop": true },
    "thinking": { "frames": [48, 49, 50, 51, 52, 53], "fps": 6, "loop": true }
  }
}
```

Replace root `pet.json` with a compatibility pointer:

```json
{
  "id": "lacritomato-mini",
  "displayName": "LacriTomato Mini",
  "manifestPath": "assets/pet/pet.json"
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/petManifest.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pet.json assets/pet tests/unit/petManifest.test.ts
git commit -m "feat: define lacritomato pet animation manifest"
```

---

### Task 4: Implement Plugin Registry and Built-In Plugin Manifests

**Files:**
- Create: `src/main/services/pluginRegistry.ts`
- Create: `src/plugins/translator/manifest.ts`
- Create: `src/plugins/screenshot/manifest.ts`
- Test: `tests/unit/pluginRegistry.test.ts`

- [ ] **Step 1: Write plugin registry test**

Create `tests/unit/pluginRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPluginRegistry } from "../../src/main/services/pluginRegistry";
import { translatorManifest } from "../../src/plugins/translator/manifest";
import { screenshotManifest } from "../../src/plugins/screenshot/manifest";

describe("plugin registry", () => {
  it("collects menu items from enabled plugins", () => {
    const registry = createPluginRegistry([translatorManifest, screenshotManifest], {
      translator: true,
      screenshot: true,
    });

    expect(registry.getMenuItems().map((item) => item.label)).toEqual([
      "翻译",
      "截图",
      "截图并 OCR",
      "贴图管理",
    ]);
  });

  it("skips disabled plugin contributions", () => {
    const registry = createPluginRegistry([translatorManifest, screenshotManifest], {
      translator: false,
      screenshot: true,
    });

    expect(registry.getMenuItems().some((item) => item.label === "翻译")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/pluginRegistry.test.ts`

Expected: FAIL because plugin registry and manifests do not exist.

- [ ] **Step 3: Create translator manifest**

Create `src/plugins/translator/manifest.ts`:

```ts
import type { PetdexPluginManifest } from "../../shared/pluginTypes";

export const translatorManifest: PetdexPluginManifest = {
  id: "translator",
  name: "翻译",
  version: "0.1.0",
  menuItems: [
    { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
  ],
  shortcuts: [
    { id: "openTranslator", label: "打开翻译", defaultAccelerator: "CommandOrControl+Shift+T" },
    { id: "quickTranslateSelection", label: "选中文字翻译", defaultAccelerator: "CommandOrControl+Shift+Y" },
  ],
  settingsSections: [
    { id: "translator.settings", label: "翻译", rendererRoute: "translator-settings" },
  ],
  panels: [
    { id: "translator.panel", title: "翻译", rendererRoute: "translator-panel" },
  ],
  capabilities: ["model:text", "clipboard:text"],
};
```

- [ ] **Step 4: Create screenshot manifest**

Create `src/plugins/screenshot/manifest.ts`:

```ts
import type { PetdexPluginManifest } from "../../shared/pluginTypes";

export const screenshotManifest: PetdexPluginManifest = {
  id: "screenshot",
  name: "截图",
  version: "0.1.0",
  menuItems: [
    { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
    { id: "screenshot.captureOcr", label: "截图并 OCR", action: "screenshot.captureOcr", icon: "ScanText" },
    { id: "screenshot.pins", label: "贴图管理", action: "screenshot.openPins", icon: "Pin" },
  ],
  shortcuts: [
    { id: "captureArea", label: "截图", defaultAccelerator: "CommandOrControl+Shift+A" },
    { id: "captureOcr", label: "截图并 OCR", defaultAccelerator: "CommandOrControl+Shift+O" },
  ],
  settingsSections: [
    { id: "screenshot.settings", label: "截图", rendererRoute: "screenshot-settings" },
    { id: "ocr.settings", label: "OCR", rendererRoute: "ocr-settings" },
  ],
  panels: [
    { id: "screenshot.overlay", title: "截图", rendererRoute: "screenshot-overlay" },
  ],
  capabilities: ["screen:capture", "clipboard:image", "file:save", "ocr:local"],
};
```

- [ ] **Step 5: Implement plugin registry**

Create `src/main/services/pluginRegistry.ts`:

```ts
import type { PetdexPluginManifest, PluginMenuItem } from "../../shared/pluginTypes";

export interface PluginRegistry {
  getEnabledPlugins(): PetdexPluginManifest[];
  getMenuItems(): PluginMenuItem[];
  findAction(action: string): { pluginId: string; item: PluginMenuItem } | undefined;
}

export function createPluginRegistry(
  manifests: PetdexPluginManifest[],
  enabledPlugins: Record<string, boolean>,
): PluginRegistry {
  const enabled = manifests.filter((manifest) => enabledPlugins[manifest.id] !== false);

  return {
    getEnabledPlugins() {
      return [...enabled];
    },
    getMenuItems() {
      return enabled.flatMap((manifest) => manifest.menuItems);
    },
    findAction(action) {
      for (const manifest of enabled) {
        const item = manifest.menuItems.find((entry) => entry.action === action);
        if (item) {
          return { pluginId: manifest.id, item };
        }
      }

      return undefined;
    },
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/unit/pluginRegistry.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/pluginRegistry.ts src/plugins tests/unit/pluginRegistry.test.ts
git commit -m "feat: register built-in plugins"
```

---

### Task 5: Implement Secure Config Service

**Files:**
- Create: `src/main/services/configService.ts`
- Test: `tests/unit/configService.test.ts`

- [ ] **Step 1: Write config service test**

Create `tests/unit/configService.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConfigService } from "../../src/main/services/configService";

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("config service", () => {
  it("writes default config on first load", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    const service = createConfigService({ userDataPath: dir });

    const config = service.getConfig();

    expect(config.pet.defaultHeight).toBe(224);
    expect(readFileSync(join(dir, "config.json"), "utf8")).toContain("deepseek-flash");
  });

  it("merges persisted config with defaults", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-config-"));
    const service = createConfigService({ userDataPath: dir });

    service.setConfig({ pet: { defaultHeight: 192 } });

    expect(service.getConfig().pet.defaultHeight).toBe(192);
    expect(service.getConfig().shortcuts.captureArea).toBe("CommandOrControl+Shift+A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/configService.test.ts`

Expected: FAIL because config service does not exist.

- [ ] **Step 3: Implement config service**

Create `src/main/services/configService.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appConfigSchema, defaultAppConfig, type AppConfig } from "../../shared/configSchema";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

export interface ConfigServiceOptions {
  userDataPath: string;
}

export interface ConfigService {
  getConfig(): AppConfig;
  setConfig(update: DeepPartial<AppConfig>): AppConfig;
}

function mergeConfig(base: AppConfig, update: DeepPartial<AppConfig>): AppConfig {
  return appConfigSchema.parse({
    ...base,
    ...update,
    model: { ...base.model, ...update.model },
    shortcuts: { ...base.shortcuts, ...update.shortcuts },
    translator: { ...base.translator, ...update.translator },
    screenshot: { ...base.screenshot, ...update.screenshot },
    ocr: { ...base.ocr, ...update.ocr },
    pet: { ...base.pet, ...update.pet },
    plugins: { ...base.plugins, ...update.plugins },
  });
}

export function createConfigService(options: ConfigServiceOptions): ConfigService {
  const configPath = join(options.userDataPath, "config.json");
  mkdirSync(options.userDataPath, { recursive: true });

  let current = defaultAppConfig;

  if (existsSync(configPath)) {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as DeepPartial<AppConfig>;
    current = mergeConfig(defaultAppConfig, parsed);
  } else {
    writeFileSync(configPath, JSON.stringify(current, null, 2), "utf8");
  }

  return {
    getConfig() {
      return current;
    },
    setConfig(update) {
      current = mergeConfig(current, update);
      writeFileSync(configPath, JSON.stringify(current, null, 2), "utf8");
      return current;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/configService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/configService.ts tests/unit/configService.test.ts
git commit -m "feat: persist app configuration"
```

---

### Task 6: Implement Electron Main, Preload Bridge, and Window Factories

**Files:**
- Create: `src/main/app.ts`
- Create: `src/main/windows/createPetWindow.ts`
- Create: `src/main/windows/createSettingsWindow.ts`
- Create: `src/main/windows/createTranslatorPanel.ts`
- Create: `src/main/windows/createScreenshotOverlay.ts`
- Create: `src/main/windows/createPinnedImageWindow.ts`
- Create: `src/preload/api.ts`
- Create: `src/preload/index.ts`
- Create: `src/main/ipc/registerCoreIpc.ts`

- [ ] **Step 1: Create preload API types**

Create `src/preload/api.ts`:

```ts
import type { AppConfig } from "../shared/configSchema";
import type { PluginMenuItem } from "../shared/pluginTypes";

export interface PetdexApi {
  config: {
    get(): Promise<AppConfig>;
    set(update: Partial<AppConfig>): Promise<AppConfig>;
    setApiKey(apiKey: string): Promise<void>;
  };
  plugins: {
    listMenuItems(): Promise<PluginMenuItem[]>;
    invokeAction(action: string): Promise<void>;
  };
  model: {
    translate(request: unknown): Promise<unknown>;
  };
}

declare global {
  interface Window {
    petdex: PetdexApi;
  }
}
```

- [ ] **Step 2: Create preload implementation**

Create `src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels } from "../shared/ipcChannels";
import type { PetdexApi } from "./api";

const api: PetdexApi = {
  config: {
    get: () => ipcRenderer.invoke(ipcChannels.configGet),
    set: (update) => ipcRenderer.invoke(ipcChannels.configSet, update),
    setApiKey: (apiKey) => ipcRenderer.invoke(ipcChannels.secureConfigSetApiKey, apiKey),
  },
  plugins: {
    listMenuItems: () => ipcRenderer.invoke(ipcChannels.pluginListMenuItems),
    invokeAction: (action) => ipcRenderer.invoke(ipcChannels.pluginInvokeAction, action),
  },
  model: {
    translate: (request) => ipcRenderer.invoke(ipcChannels.modelTranslate, request),
  },
};

contextBridge.exposeInMainWorld("petdex", api);
```

- [ ] **Step 3: Create window factories**

Create `src/main/windows/createPetWindow.ts`:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createPetWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 280,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "pet" } });
  return window;
}
```

Create `src/main/windows/createSettingsWindow.ts`:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createSettingsWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    title: "LacriTomato Mini 设置",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "settings" } });
  return window;
}
```

Create `src/main/windows/createTranslatorPanel.ts`:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createTranslatorPanel(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 760,
    height: 560,
    title: "翻译",
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "translator" } });
  return window;
}
```

Create `src/main/windows/createScreenshotOverlay.ts`:

```ts
import { BrowserWindow, Rectangle } from "electron";
import { join } from "node:path";

export function createScreenshotOverlay(preloadPath: string, bounds: Rectangle): BrowserWindow {
  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "screenshot-overlay" } });
  return window;
}
```

Create `src/main/windows/createPinnedImageWindow.ts`:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createPinnedImageWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(join(process.cwd(), "dist/renderer/index.html"), { query: { view: "pinned-image" } });
  return window;
}
```

- [ ] **Step 4: Create core IPC**

Create `src/main/ipc/registerCoreIpc.ts`:

```ts
import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type { ConfigService } from "../services/configService";
import type { PluginRegistry } from "../services/pluginRegistry";

export interface CoreIpcDependencies {
  configService: ConfigService;
  pluginRegistry: PluginRegistry;
  invokePluginAction(action: string): Promise<void>;
}

export function registerCoreIpc(deps: CoreIpcDependencies): void {
  ipcMain.handle(ipcChannels.configGet, () => deps.configService.getConfig());
  ipcMain.handle(ipcChannels.configSet, (_event, update) => deps.configService.setConfig(update));
  ipcMain.handle(ipcChannels.pluginListMenuItems, () => deps.pluginRegistry.getMenuItems());
  ipcMain.handle(ipcChannels.pluginInvokeAction, (_event, action: string) => deps.invokePluginAction(action));
}
```

- [ ] **Step 5: Create app bootstrap**

Create `src/main/app.ts`:

```ts
import { app, Menu, Tray } from "electron";
import { join } from "node:path";
import { defaultAppConfig } from "../shared/configSchema";
import { screenshotManifest } from "../plugins/screenshot/manifest";
import { translatorManifest } from "../plugins/translator/manifest";
import { createConfigService } from "./services/configService";
import { createPluginRegistry } from "./services/pluginRegistry";
import { registerCoreIpc } from "./ipc/registerCoreIpc";
import { createPetWindow } from "./windows/createPetWindow";
import { createSettingsWindow } from "./windows/createSettingsWindow";
import { createTranslatorPanel } from "./windows/createTranslatorPanel";

let tray: Tray | undefined;

async function main() {
  await app.whenReady();

  const preloadPath = join(process.cwd(), "dist/src/preload/index.js");
  const configService = createConfigService({ userDataPath: app.getPath("userData") });
  const pluginRegistry = createPluginRegistry([translatorManifest, screenshotManifest], defaultAppConfig.plugins);

  const petWindow = createPetWindow(preloadPath);

  async function invokePluginAction(action: string): Promise<void> {
    if (action === "translator.open") {
      createTranslatorPanel(preloadPath);
      return;
    }

    if (action === "settings.open") {
      createSettingsWindow(preloadPath);
      return;
    }

    petWindow.webContents.send("pet:bubble", `功能 ${action} 已收到`);
  }

  registerCoreIpc({ configService, pluginRegistry, invokePluginAction });

  tray = new Tray(join(process.cwd(), "assets/pet/spritesheet.webp"));
  tray.setToolTip("LacriTomato Mini");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示宠物", click: () => petWindow.show() },
    { label: "隐藏宠物", click: () => petWindow.hide() },
    { label: "设置", click: () => createSettingsWindow(preloadPath) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));
}

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

main().catch((error) => {
  console.error(error);
  app.quit();
});
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main src/preload
git commit -m "feat: create electron shell and preload bridge"
```

---

### Task 7: Build Pet Renderer with Animated Head Menu

**Files:**
- Create: `src/renderer/router.tsx`
- Create: `src/renderer/shell/PetApp.tsx`
- Create: `src/renderer/shell/PetApp.css`
- Create: `src/renderer/components/PetSprite.tsx`
- Create: `src/renderer/components/PetHeadMenu.tsx`
- Test: `tests/renderer/PetHeadMenu.test.tsx`

- [ ] **Step 1: Write animated menu renderer test**

Create `tests/renderer/PetHeadMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PetHeadMenu } from "../../src/renderer/components/PetHeadMenu";

describe("PetHeadMenu", () => {
  it("renders plugin menu items as animated keys", async () => {
    const onAction = vi.fn();
    render(
      <PetHeadMenu
        open
        items={[
          { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
          { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
        ]}
        onAction={onAction}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(onAction).toHaveBeenCalledWith("translator.open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/renderer/PetHeadMenu.test.tsx`

Expected: FAIL because `PetHeadMenu` does not exist.

- [ ] **Step 3: Implement PetHeadMenu**

Create `src/renderer/components/PetHeadMenu.tsx`:

```tsx
import { Camera, Languages, MessageCircle, Pin, ScanLine, ScanText, Settings, X } from "lucide-react";
import type { PluginMenuItem } from "../../shared/pluginTypes";
import "../shell/PetApp.css";

const icons = {
  Camera,
  Languages,
  MessageCircle,
  Pin,
  ScanLine,
  ScanText,
  Settings,
  X,
};

interface PetHeadMenuProps {
  open: boolean;
  items: PluginMenuItem[];
  onAction(action: string): void;
}

export function PetHeadMenu({ open, items, onAction }: PetHeadMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="pet-head-menu" aria-label="宠物功能菜单">
      {items.map((item, index) => {
        const Icon = icons[item.icon as keyof typeof icons] ?? Settings;

        return (
          <button
            key={item.id}
            className="pet-head-menu__key"
            style={{ "--delay": `${index * 42}ms` } as React.CSSProperties}
            type="button"
            aria-label={item.label}
            disabled={item.disabled}
            onClick={() => onAction(item.action)}
          >
            <Icon size={18} aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement pet sprite and app shell**

Create `src/renderer/components/PetSprite.tsx`:

```tsx
import "../shell/PetApp.css";

interface PetSpriteProps {
  spritesheetUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameIndex: number;
  columns: number;
  displayHeight: number;
}

export function PetSprite(props: PetSpriteProps) {
  const column = props.frameIndex % props.columns;
  const row = Math.floor(props.frameIndex / props.columns);
  const scale = props.displayHeight / props.frameHeight;

  return (
    <div
      className="pet-sprite"
      style={{
        width: props.frameWidth * scale,
        height: props.frameHeight * scale,
        backgroundImage: `url(${props.spritesheetUrl})`,
        backgroundSize: `${props.frameWidth * props.columns * scale}px auto`,
        backgroundPosition: `-${column * props.frameWidth * scale}px -${row * props.frameHeight * scale}px`,
      }}
      aria-label="LacriTomato Mini"
    />
  );
}
```

Create `src/renderer/shell/PetApp.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { PluginMenuItem } from "../../shared/pluginTypes";
import { PetHeadMenu } from "../components/PetHeadMenu";
import { PetSprite } from "../components/PetSprite";
import "./PetApp.css";

const fallbackMenuItems: PluginMenuItem[] = [
  { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
  { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
  { id: "screenshot.captureOcr", label: "截图并 OCR", action: "screenshot.captureOcr", icon: "ScanText" },
  { id: "screenshot.pins", label: "贴图管理", action: "screenshot.openPins", icon: "Pin" },
  { id: "chat.open", label: "和我聊天", action: "chat.open", icon: "MessageCircle", disabled: true },
  { id: "settings.open", label: "设置", action: "settings.open", icon: "Settings" },
];

export function PetApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>(fallbackMenuItems);
  const [frame, setFrame] = useState(0);
  const frames = useMemo(() => [0, 1, 2, 3, 4, 5], []);

  useEffect(() => {
    window.petdex?.plugins.listMenuItems().then((items) => {
      setMenuItems([...items, fallbackMenuItems[4], fallbackMenuItems[5]]);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((value) => (value + 1) % frames.length);
    }, 160);

    return () => window.clearInterval(timer);
  }, [frames.length]);

  async function invoke(action: string) {
    if (action === "chat.open") {
      setMenuOpen(false);
      return;
    }

    await window.petdex.plugins.invokeAction(action);
    setMenuOpen(false);
  }

  return (
    <main
      className="pet-root"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen((value) => !value);
      }}
    >
      <PetHeadMenu open={menuOpen} items={menuItems} onAction={invoke} />
      <PetSprite
        spritesheetUrl="../../assets/pet/spritesheet.webp"
        frameWidth={192}
        frameHeight={208}
        frameIndex={frames[frame]}
        columns={8}
        displayHeight={224}
      />
    </main>
  );
}
```

Create `src/renderer/shell/PetApp.css`:

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
  font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
}

.pet-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: transparent;
  user-select: none;
  -webkit-app-region: drag;
}

.pet-sprite {
  image-rendering: auto;
  background-repeat: no-repeat;
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
}

.pet-head-menu {
  position: absolute;
  left: 50%;
  bottom: 230px;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  transform: translateX(-50%);
  -webkit-app-region: no-drag;
}

.pet-head-menu__key {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 128px;
  height: 36px;
  padding: 0 12px;
  color: #fff;
  background: rgba(22, 24, 30, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  animation: pet-key-rise 180ms ease-out both;
  animation-delay: var(--delay);
}

.pet-head-menu__key:hover {
  transform: translateY(-2px) scale(1.04);
  border-color: rgba(255, 93, 93, 0.7);
  background: rgba(54, 24, 28, 0.95);
}

.pet-head-menu__key:disabled {
  opacity: 0.55;
  cursor: default;
}

@keyframes pet-key-rise {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

- [ ] **Step 5: Add renderer router**

Create `src/renderer/router.tsx`:

```tsx
import { PetApp } from "./shell/PetApp";

export function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "pet") {
    return <PetApp />;
  }

  return <PetApp />;
}
```

Modify `src/renderer/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./router";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/renderer/PetHeadMenu.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer tests/renderer/PetHeadMenu.test.tsx
git commit -m "feat: add animated pet head menu"
```

---

### Task 8: Implement Model Service and Translator Plugin UI

**Files:**
- Create: `src/main/services/modelService.ts`
- Create: `src/plugins/translator/types.ts`
- Create: `src/plugins/translator/renderer/TranslatorPanel.tsx`
- Create: `src/plugins/translator/renderer/TranslatorSettings.tsx`
- Modify: `src/main/ipc/registerCoreIpc.ts`
- Modify: `src/renderer/router.tsx`
- Test: `tests/unit/modelService.test.ts`
- Test: `tests/renderer/TranslatorPanel.test.tsx`

- [ ] **Step 1: Write model service test**

Create `tests/unit/modelService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createModelService } from "../../src/main/services/modelService";

describe("model service", () => {
  it("requests OpenAI-compatible chat completions and parses JSON translations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                detectedLanguage: "zh-CN",
                translations: { en: "Hello", ja: "こんにちは" },
              }),
            },
          },
        ],
      }),
    });

    const service = createModelService({ fetch: fetchMock });
    const result = await service.translate(
      {
        sourceText: "你好",
        sourceLanguage: "auto",
        targetLanguages: ["en", "ja"],
        style: "accurate",
      },
      {
        baseURL: "https://api.deepseek.com",
        apiKey: "test-key",
        model: "deepseek-flash",
        temperature: 0.2,
        timeoutMs: 60000,
      },
    );

    expect(result.results).toEqual([
      { language: "en", text: "Hello" },
      { language: "ja", text: "こんにちは" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/modelService.test.ts`

Expected: FAIL because model service does not exist.

- [ ] **Step 3: Implement translator types and model service**

Create `src/plugins/translator/types.ts`:

```ts
export interface TranslateRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguages: string[];
  style: "accurate" | "natural" | "concise";
}

export interface TranslateResult {
  detectedLanguage?: string;
  results: Array<{
    language: string;
    text: string;
  }>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  raw?: string;
}
```

Create `src/main/services/modelService.ts`:

```ts
import type { TranslateRequest, TranslateResult } from "../../plugins/translator/types";
import type { modelConfigSchema } from "../../shared/configSchema";
import type { z } from "zod";

type ModelConfig = z.infer<typeof modelConfigSchema> & { apiKey: string };

export interface ModelService {
  translate(request: TranslateRequest, config: ModelConfig): Promise<TranslateResult>;
}

export function createModelService(options: { fetch: typeof fetch }): ModelService {
  return {
    async translate(request, config) {
      const response = await options.fetch(`${config.baseURL.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          messages: [
            {
              role: "system",
              content: "You are a translation engine. Return strict JSON only.",
            },
            {
              role: "user",
              content: [
                `Source language: ${request.sourceLanguage}`,
                `Target languages: ${request.targetLanguages.join(", ")}`,
                `Style: ${request.style}`,
                "Return JSON shape: {\"detectedLanguage\":\"...\",\"translations\":{\"en\":\"...\"}}",
                `Text:\n${request.sourceText}`,
              ].join("\n"),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Model request failed with HTTP ${response.status}`);
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content) as {
        detectedLanguage?: string;
        translations?: Record<string, string>;
      };

      return {
        detectedLanguage: parsed.detectedLanguage,
        results: request.targetLanguages.map((language) => ({
          language,
          text: parsed.translations?.[language] ?? "",
        })),
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
        },
        raw: content,
      };
    },
  };
}
```

- [ ] **Step 4: Run model service test**

Run: `npm test -- tests/unit/modelService.test.ts`

Expected: PASS.

- [ ] **Step 5: Write translator panel test**

Create `tests/renderer/TranslatorPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPanel } from "../../src/plugins/translator/renderer/TranslatorPanel";

describe("TranslatorPanel", () => {
  beforeEach(() => {
    window.petdex = {
      config: {
        get: vi.fn(),
        set: vi.fn(),
        setApiKey: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn().mockResolvedValue({
          results: [{ language: "en", text: "Hello" }],
        }),
      },
    };
  });

  it("translates pasted text", async () => {
    render(<TranslatorPanel />);
    await userEvent.type(screen.getByLabelText("输入文本"), "你好");
    await userEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(await screen.findByText("Hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement translator panel**

Create `src/plugins/translator/renderer/TranslatorPanel.tsx`:

```tsx
import { useState } from "react";
import { sourceLanguages, targetLanguages } from "../../../shared/languages";
import type { TranslateResult } from "../types";

export function TranslatorPanel() {
  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [selectedTargets, setSelectedTargets] = useState(["en"]);
  const [result, setResult] = useState<TranslateResult | undefined>();
  const [error, setError] = useState("");

  async function translate() {
    setError("");
    try {
      const response = await window.petdex.model.translate({
        sourceText,
        sourceLanguage,
        targetLanguages: selectedTargets,
        style: "accurate",
      }) as TranslateResult;
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "翻译失败");
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: "Microsoft YaHei, Segoe UI, sans-serif" }}>
      <h1>翻译</h1>
      <label>
        源语言
        <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
          {sourceLanguages.map((language) => (
            <option key={language.code} value={language.code}>{language.label}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>目标语言</legend>
        {targetLanguages.map((language) => (
          <label key={language.code}>
            <input
              type="checkbox"
              checked={selectedTargets.includes(language.code)}
              onChange={(event) => {
                setSelectedTargets((current) =>
                  event.target.checked
                    ? [...current, language.code]
                    : current.filter((code) => code !== language.code),
                );
              }}
            />
            {language.label}
          </label>
        ))}
      </fieldset>
      <textarea
        aria-label="输入文本"
        value={sourceText}
        onChange={(event) => setSourceText(event.target.value)}
        rows={8}
        style={{ width: "100%", marginTop: 12 }}
      />
      <button type="button" onClick={translate} disabled={!sourceText.trim() || selectedTargets.length === 0}>
        翻译
      </button>
      {error && <p role="alert">{error}</p>}
      {result?.results.map((item) => (
        <section key={item.language}>
          <h2>{item.language}</h2>
          <p>{item.text}</p>
        </section>
      ))}
    </main>
  );
}
```

Create `src/plugins/translator/renderer/TranslatorSettings.tsx`:

```tsx
export function TranslatorSettings() {
  return (
    <section>
      <h2>翻译设置</h2>
      <p>翻译历史、本地提示词和默认语言在这里配置。</p>
    </section>
  );
}
```

- [ ] **Step 7: Route translator view**

Modify `src/renderer/router.tsx`:

```tsx
import { TranslatorPanel } from "../plugins/translator/renderer/TranslatorPanel";
import { PetApp } from "./shell/PetApp";

export function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "translator") {
    return <TranslatorPanel />;
  }

  return <PetApp />;
}
```

- [ ] **Step 8: Run tests**

Run: `npm test -- tests/unit/modelService.test.ts tests/renderer/TranslatorPanel.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main/services/modelService.ts src/plugins/translator src/renderer/router.tsx tests/unit/modelService.test.ts tests/renderer/TranslatorPanel.test.tsx
git commit -m "feat: add translator plugin"
```

---

### Task 9: Build Settings Window UI

**Files:**
- Create: `src/renderer/shell/SettingsApp.tsx`
- Create: `src/renderer/shell/SettingsApp.css`
- Modify: `src/renderer/router.tsx`
- Test: `tests/renderer/SettingsApp.test.tsx`

- [ ] **Step 1: Write settings test**

Create `tests/renderer/SettingsApp.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAppConfig } from "../../src/shared/configSchema";
import { SettingsApp } from "../../src/renderer/shell/SettingsApp";

describe("SettingsApp", () => {
  beforeEach(() => {
    window.petdex = {
      config: {
        get: vi.fn().mockResolvedValue(defaultAppConfig),
        set: vi.fn(),
        setApiKey: vi.fn(),
      },
      plugins: {
        listMenuItems: vi.fn(),
        invokeAction: vi.fn(),
      },
      model: {
        translate: vi.fn(),
      },
    };
  });

  it("shows model and shortcut defaults", async () => {
    render(<SettingsApp />);
    expect(await screen.findByDisplayValue("deepseek-flash")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("CommandOrControl+Shift+A")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement settings UI**

Create `src/renderer/shell/SettingsApp.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { AppConfig } from "../../shared/configSchema";
import { defaultAppConfig } from "../../shared/configSchema";
import "./SettingsApp.css";

export function SettingsApp() {
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    window.petdex.config.get().then(setConfig);
  }, []);

  async function saveModel() {
    await window.petdex.config.set({ model: config.model });
    if (apiKey.trim()) {
      await window.petdex.config.setApiKey(apiKey);
      setApiKey("");
    }
  }

  return (
    <main className="settings-root">
      <aside className="settings-sidebar">
        <button>模型</button>
        <button>快捷键</button>
        <button>截图</button>
        <button>OCR</button>
        <button>桌宠</button>
        <button>插件</button>
      </aside>
      <section className="settings-content">
        <h1>设置</h1>
        <label>
          Base URL
          <input
            value={config.model.baseURL}
            onChange={(event) => setConfig({ ...config, model: { ...config.model, baseURL: event.target.value } })}
          />
        </label>
        <label>
          Model
          <input
            value={config.model.model}
            onChange={(event) => setConfig({ ...config, model: { ...config.model, model: event.target.value } })}
          />
        </label>
        <label>
          API Key
          <input value={apiKey} type="password" onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <label>
          截图快捷键
          <input
            value={config.shortcuts.captureArea}
            onChange={(event) => setConfig({
              ...config,
              shortcuts: { ...config.shortcuts, captureArea: event.target.value },
            })}
          />
        </label>
        <button type="button" onClick={saveModel}>保存</button>
      </section>
    </main>
  );
}
```

Create `src/renderer/shell/SettingsApp.css`:

```css
.settings-root {
  display: grid;
  grid-template-columns: 180px 1fr;
  min-height: 100vh;
  background: #101114;
  color: #f4f1ee;
  font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px;
  background: #0b0c0f;
  border-right: 1px solid #303541;
}

.settings-sidebar button {
  height: 36px;
  color: #eee;
  background: #1b1f28;
  border: 1px solid #303541;
  border-radius: 8px;
}

.settings-content {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 24px;
}

.settings-content label {
  display: grid;
  gap: 6px;
}

.settings-content input {
  height: 34px;
  padding: 0 10px;
  color: #fff;
  background: #17191f;
  border: 1px solid #343946;
  border-radius: 8px;
}
```

- [ ] **Step 3: Route settings view**

Modify `src/renderer/router.tsx`:

```tsx
import { TranslatorPanel } from "../plugins/translator/renderer/TranslatorPanel";
import { PetApp } from "./shell/PetApp";
import { SettingsApp } from "./shell/SettingsApp";

export function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "translator") {
    return <TranslatorPanel />;
  }

  if (view === "settings") {
    return <SettingsApp />;
  }

  return <PetApp />;
}
```

- [ ] **Step 4: Run settings test**

Run: `npm test -- tests/renderer/SettingsApp.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/SettingsApp.tsx src/renderer/shell/SettingsApp.css src/renderer/router.tsx tests/renderer/SettingsApp.test.tsx
git commit -m "feat: add settings window"
```

---

### Task 10: Implement Screenshot Overlay and Annotation Model

**Files:**
- Create: `src/plugins/screenshot/types.ts`
- Create: `src/plugins/screenshot/renderer/ScreenshotOverlay.tsx`
- Create: `src/plugins/screenshot/renderer/ScreenshotEditor.tsx`
- Create: `src/plugins/screenshot/renderer/ScreenshotSettings.tsx`
- Modify: `src/renderer/router.tsx`
- Test: `tests/unit/screenshotAnnotations.test.ts`

- [ ] **Step 1: Write annotation model test**

Create `tests/unit/screenshotAnnotations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addAnnotation, undoAnnotation } from "../../src/plugins/screenshot/types";

describe("screenshot annotations", () => {
  it("adds and undoes annotations immutably", () => {
    const state = { annotations: [] };
    const next = addAnnotation(state, { type: "rect", x: 1, y: 2, w: 10, h: 20, color: "#ff0000" });
    expect(next.annotations).toHaveLength(1);
    expect(state.annotations).toHaveLength(0);
    expect(undoAnnotation(next).annotations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement screenshot types**

Create `src/plugins/screenshot/types.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

export type Annotation =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { type: "arrow"; from: Point; to: Point; color: string }
  | { type: "pen"; points: Point[]; color: string; size: number }
  | { type: "text"; x: number; y: number; text: string; color: string }
  | { type: "mosaic"; rect: { x: number; y: number; w: number; h: number }; size: number };

export interface ScreenshotEditorState {
  annotations: Annotation[];
}

export function addAnnotation(state: ScreenshotEditorState, annotation: Annotation): ScreenshotEditorState {
  return { annotations: [...state.annotations, annotation] };
}

export function undoAnnotation(state: ScreenshotEditorState): ScreenshotEditorState {
  return { annotations: state.annotations.slice(0, -1) };
}
```

- [ ] **Step 3: Run annotation test**

Run: `npm test -- tests/unit/screenshotAnnotations.test.ts`

Expected: PASS.

- [ ] **Step 4: Implement screenshot overlay UI**

Create `src/plugins/screenshot/renderer/ScreenshotOverlay.tsx`:

```tsx
import { useState } from "react";
import "./screenshot.css";

interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ScreenshotOverlay() {
  const [start, setStart] = useState<{ x: number; y: number } | undefined>();
  const [selection, setSelection] = useState<Selection | undefined>();

  return (
    <main
      className="screenshot-overlay"
      onMouseDown={(event) => setStart({ x: event.clientX, y: event.clientY })}
      onMouseMove={(event) => {
        if (!start) return;
        setSelection({
          x: Math.min(start.x, event.clientX),
          y: Math.min(start.y, event.clientY),
          w: Math.abs(event.clientX - start.x),
          h: Math.abs(event.clientY - start.y),
        });
      }}
      onMouseUp={() => setStart(undefined)}
    >
      {selection && (
        <div
          className="screenshot-selection"
          style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
        />
      )}
      {selection && <ScreenshotToolbar />}
    </main>
  );
}

function ScreenshotToolbar() {
  return (
    <div className="screenshot-toolbar">
      <button>复制</button>
      <button>保存</button>
      <button>OCR</button>
      <button>矩形</button>
      <button>箭头</button>
      <button>画笔</button>
      <button>文字</button>
      <button>马赛克</button>
      <button>撤销</button>
    </div>
  );
}
```

Create `src/plugins/screenshot/renderer/ScreenshotEditor.tsx`:

```tsx
export function ScreenshotEditor() {
  return <section>截图编辑器</section>;
}
```

Create `src/plugins/screenshot/renderer/ScreenshotSettings.tsx`:

```tsx
export function ScreenshotSettings() {
  return <section>截图设置</section>;
}
```

Create `src/plugins/screenshot/renderer/screenshot.css`:

```css
.screenshot-overlay {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  background: rgba(0, 0, 0, 0.28);
  font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
}

.screenshot-selection {
  position: absolute;
  border: 1px solid #f34f4f;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.38);
}

.screenshot-toolbar {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px;
  background: #11141a;
  border: 1px solid #303541;
  border-radius: 10px;
}

.screenshot-toolbar button {
  height: 32px;
  color: #fff;
  background: #1d222c;
  border: 1px solid #343946;
  border-radius: 8px;
}
```

- [ ] **Step 5: Route screenshot overlay**

Modify `src/renderer/router.tsx`:

```tsx
import { ScreenshotOverlay } from "../plugins/screenshot/renderer/ScreenshotOverlay";
import { TranslatorPanel } from "../plugins/translator/renderer/TranslatorPanel";
import { PetApp } from "./shell/PetApp";
import { SettingsApp } from "./shell/SettingsApp";

export function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "translator") return <TranslatorPanel />;
  if (view === "settings") return <SettingsApp />;
  if (view === "screenshot-overlay") return <ScreenshotOverlay />;

  return <PetApp />;
}
```

- [ ] **Step 6: Run typecheck and tests**

Run: `npm test -- tests/unit/screenshotAnnotations.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/plugins/screenshot src/renderer/router.tsx tests/unit/screenshotAnnotations.test.ts
git commit -m "feat: add screenshot overlay foundation"
```

---

### Task 11: Implement Screenshot Service, Shortcuts, OCR Stub, and Pin Window Hooks

**Files:**
- Create: `src/main/services/screenshotService.ts`
- Create: `src/main/services/shortcutService.ts`
- Create: `src/main/services/ocrService.ts`
- Modify: `src/main/app.ts`
- Test: `tests/unit/ocrService.test.ts`

- [ ] **Step 1: Write OCR service test**

Create `tests/unit/ocrService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createOcrService } from "../../src/main/services/ocrService";

describe("ocr service", () => {
  it("returns empty text for empty image input", async () => {
    const service = createOcrService();
    await expect(service.recognize(Buffer.alloc(0), { mode: "local", languages: ["eng"] })).resolves.toEqual({
      text: "",
      confidence: 0,
    });
  });
});
```

- [ ] **Step 2: Implement OCR service wrapper**

Create `src/main/services/ocrService.ts`:

```ts
export interface OcrOptions {
  mode: "local" | "model";
  languages: string[];
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrService {
  recognize(image: Buffer, options: OcrOptions): Promise<OcrResult>;
}

export function createOcrService(): OcrService {
  return {
    async recognize(image) {
      if (image.length === 0) {
        return { text: "", confidence: 0 };
      }

      const tesseract = await import("tesseract.js");
      const result = await tesseract.recognize(image, "chi_sim+eng");
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence,
      };
    },
  };
}
```

- [ ] **Step 3: Implement screenshot and shortcut service**

Create `src/main/services/screenshotService.ts`:

```ts
import { BrowserWindow, desktopCapturer, nativeImage, screen } from "electron";
import { createScreenshotOverlay } from "../windows/createScreenshotOverlay";

export interface ScreenshotService {
  startAreaCapture(preloadPath: string): Promise<BrowserWindow[]>;
  capturePrimaryDisplay(): Promise<Electron.NativeImage>;
}

export function createScreenshotService(): ScreenshotService {
  return {
    async startAreaCapture(preloadPath) {
      return screen.getAllDisplays().map((display) => createScreenshotOverlay(preloadPath, display.bounds));
    },
    async capturePrimaryDisplay() {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: primary.size,
      });
      return sources[0]?.thumbnail ?? nativeImage.createEmpty();
    },
  };
}
```

Create `src/main/services/shortcutService.ts`:

```ts
import { globalShortcut } from "electron";

export interface ShortcutService {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export function createShortcutService(): ShortcutService {
  return {
    register(accelerator, callback) {
      return globalShortcut.register(accelerator, callback);
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
  };
}
```

- [ ] **Step 4: Wire screenshot action in main app**

Modify `src/main/app.ts` inside `main()` after `preloadPath` is defined:

```ts
const screenshotService = createScreenshotService();
const shortcutService = createShortcutService();
```

Modify imports:

```ts
import { createScreenshotService } from "./services/screenshotService";
import { createShortcutService } from "./services/shortcutService";
```

Modify `invokePluginAction`:

```ts
if (action === "screenshot.capture" || action === "screenshot.captureOcr") {
  await screenshotService.startAreaCapture(preloadPath);
  return;
}
```

Add shortcut registration before tray setup:

```ts
const config = configService.getConfig();
shortcutService.register(config.shortcuts.captureArea, () => {
  void screenshotService.startAreaCapture(preloadPath);
});
shortcutService.register(config.shortcuts.captureOcr, () => {
  void screenshotService.startAreaCapture(preloadPath);
});
```

Add app cleanup:

```ts
app.on("will-quit", () => {
  shortcutService.unregisterAll();
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/unit/ocrService.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services src/main/app.ts tests/unit/ocrService.test.ts
git commit -m "feat: add screenshot shortcuts and ocr service"
```

---

### Task 12: Final Verification and Windows Packaging

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-17-lacritomato-desktop-pet-platform-design.html`

- [ ] **Step 1: Create README**

Create `README.md`:

```md
# LacriTomato Mini Petdex

Windows-first Electron desktop pet platform.

## Features

- Transparent LacriTomato Mini desktop pet.
- Animated pet-head function menu.
- Translator plugin with OpenAI-compatible model config.
- Screenshot plugin with area capture, annotation foundation, OCR service, and pin-window foundation.
- Settings window for model, shortcuts, OCR, screenshot, pet behavior, and plugins.

## Commands

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm start`
- `npm run dist`

## Default Shortcuts

- Screenshot: `Ctrl+Shift+A`
- Screenshot OCR: `Ctrl+Shift+O`
- Open translator: `Ctrl+Shift+T`
- Quick translate selection: `Ctrl+Shift+Y`
- Toggle pet: `Ctrl+Shift+P`
```

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS for all unit and renderer tests.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: renderer and main builds complete and `dist/` is created.

- [ ] **Step 5: Launch app smoke test**

Run: `npm start`

Expected:
- LacriTomato pet window opens with transparent background.
- Right-clicking pet opens animated head menu.
- Clicking "翻译" opens translator panel.
- Clicking "截图" opens screenshot overlay.
- Tray menu shows display, hide, settings, exit actions.

- [ ] **Step 6: Package Windows app**

Run: `npm run dist`

Expected: Windows installer is created in `release/`.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/superpowers/specs package.json package-lock.json src tests assets
git commit -m "chore: verify lacritomato desktop pet mvp"
```

---

## Plan Self-Review

- Spec coverage: The plan covers project scaffold, shared contracts, pet asset manifest, plugin registry, secure config foundation, Electron windows, typed preload, animated pet-head menu, translator model service and UI, settings UI, screenshot overlay, annotation model, OCR service, global shortcuts, and packaging. Rolling screenshot and chat remain out of first-release scope with extension points present.
- Placeholder scan: The plan uses concrete files, concrete commands, concrete tests, and concrete implementation snippets, with no unresolved placeholder markers.
- Type consistency: `PetdexPluginManifest`, `PluginMenuItem`, `AppConfig`, `TranslateRequest`, `TranslateResult`, and screenshot `Annotation` types are introduced before use and reused consistently across tasks.
