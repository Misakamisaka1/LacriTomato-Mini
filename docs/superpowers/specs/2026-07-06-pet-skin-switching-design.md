# Pet Skin Switching Design

Date: 2026-07-06

## Summary

Add a staged pet skin switching feature. The first implementation lets users import a Petdex-compatible pet folder from disk and switch the desktop pet to that skin. It also adds a visible "Open Petdex" entry so users can browse or install pets from Petdex themselves. A later phase may add an embedded Petdex browsing experience or one-click install flow, but the first phase keeps all local file changes behind explicit user selection.

This design matches the current app architecture:

- Electron main process owns file system access, dialogs, validation, and configuration persistence.
- Preload exposes typed, narrow IPC methods.
- Renderer only displays settings and pet sprites returned by the trusted bridge.
- The existing bundled LacriTomato Mini pet remains the fallback skin.

## External Petdex Facts

Verified from Petdex docs and repository README on 2026-07-06:

- Petdex users can install pets with `npx petdex install <slug>`.
- Installed pets appear under the user's Codex pets directory, for example `~/.codex/pets/boba/`.
- A pet package is a folder containing `pet.json` and `spritesheet.webp` or `spritesheet.png`.
- Petdex exposes a public manifest surface at `https://petdex.dev/api/manifest` for approved pets.
- Petdex states the package format uses a 72-frame sprite atlas with 192 x 208 frames.

References:

- [Petdex docs](https://petdex.dev/docs)
- [Petdex repository README](https://github.com/crafter-station/petdex)

## Goals

1. Let users choose a local skin folder and immediately switch the active desktop pet.
2. Support both this app's current `PetManifest` format and Petdex/Codex pet package metadata.
3. Persist the selected skin across restarts.
4. Keep renderer file access locked down. Renderer must not read arbitrary local paths.
5. Recover gracefully if the selected skin is moved, deleted, malformed, or incompatible.
6. Add a simple Petdex discovery path through an "Open Petdex" button and clear install guidance.

## Non-Goals

1. Do not embed the Petdex website in the first phase.
2. Do not let a remote website directly replace the local skin.
3. Do not run `npx petdex install` from inside the app in the first phase.
4. Do not execute JavaScript, shell scripts, or any other code from pet folders.
5. Do not build a full local skin library manager yet. The active skin plus reset/import controls are enough.

## User Experience

### Settings

The existing Settings window gains a skin area inside the "桌宠" section.

Visible fields:

- Current skin display name.
- Current skin source:
  - "内置皮肤" for bundled LacriTomato Mini.
  - Local folder path for imported user skins.
- Skin status:
  - "已加载" when the current skin is valid.
  - A short warning when the configured skin cannot be loaded and the app is using the fallback.

Controls:

- "导入皮肤文件夹": opens an Electron folder picker.
- "打开 Petdex": opens `https://petdex.dev/` in the user's default browser.
- "恢复默认皮肤": clears the custom skin and returns to bundled LacriTomato Mini.

Helper text:

```text
可在 Petdex 选择喜欢的宠物，使用 npx petdex install <slug> 下载后，选择包含 pet.json 和 spritesheet.webp/png 的文件夹。
```

### Pet Window

The pet window loads the active skin at startup. When the user imports or resets a skin from Settings, the main process broadcasts a config change and a pet skin change event. `PetApp` reloads the current skin without requiring an app restart.

If the configured custom skin fails to load, the pet continues rendering the bundled LacriTomato Mini skin. The pet shows a short bubble such as:

```text
皮肤加载失败，已恢复默认皮肤
```

## Architecture

### New Service: `petSkinService`

Create `src/main/services/petSkinService.ts`.

Responsibilities:

- Load bundled fallback skin from `assets/pet/pet.json` and `assets/pet/spritesheet.webp`.
- Validate an imported skin folder.
- Normalize supported manifest shapes into the app's existing `PetManifest` shape.
- Reject unsafe sprite paths.
- Return a renderer-safe skin payload with a local asset URL or data URL.
- Persist only the selected folder path through config. Do not copy or mutate user folders in phase one.

Proposed service API:

```ts
export interface PetSkinService {
  getCurrentSkin(): PetSkinLoadResult;
  importSkinFolder(folderPath: string): PetSkinLoadResult;
  resetSkin(): PetSkinLoadResult;
  openPetdex(): void;
}
```

`openPetdex()` uses Electron `shell.openExternal("https://petdex.dev/")`.

### Shared Types

Extend `src/shared/petManifest.ts` with renderer-safe skin result types:

```ts
export interface PetSkin {
  manifest: PetManifest;
  spritesheetUrl: string;
  sourcePath?: string;
  source: "bundled" | "local";
}

export interface PetSkinLoadResult {
  skin: PetSkin;
  fallbackUsed: boolean;
  warning?: string;
}
```

The `spritesheetUrl` must be created by trusted main-process code. Renderer should not concatenate arbitrary file paths.

### Config

Extend `AppConfig["pet"]`:

```ts
skinSourcePath: string;
```

Default value:

```ts
skinSourcePath: "";
```

An empty string means "use bundled LacriTomato Mini".

Config migration works through the existing `zod` defaulting and merge path. Older config files receive `skinSourcePath: ""` automatically.

### IPC and Preload

Add IPC channels:

- `pet:skin:get-current`
- `pet:skin:import-folder`
- `pet:skin:reset`
- `pet:skin:open-petdex`
- `pet:skin:changed`

Expose these through `window.petdex.pet`:

```ts
getCurrentSkin(): Promise<PetSkinLoadResult>;
importSkinFolder(): Promise<PetSkinLoadResult | undefined>;
resetSkin(): Promise<PetSkinLoadResult>;
openPetdex(): Promise<void>;
onSkinChanged(callback: (result: PetSkinLoadResult) => void): () => void;
```

`importSkinFolder()` owns the dialog in the main process. It does not accept a renderer-provided path. This prevents renderer code from probing arbitrary local paths.

### Main Process Dialog Flow

`registerCoreIpc` handles `pet:skin:import-folder`:

1. Resolve the sender window.
2. Open a directory picker with title "选择宠物皮肤文件夹".
3. If canceled, return `undefined`.
4. Pass the selected folder to `petSkinService.importSkinFolder`.
5. Persist `config.pet.skinSourcePath`.
6. Broadcast `configChanged` and `pet:skin:changed` to all windows.
7. Return the load result to the caller.

### Renderer Flow

`PetApp` changes from static imports to a runtime skin state:

- Initial state is the bundled manifest and spritesheet URL, so the pet can render immediately.
- On mount, call `window.petdex.pet.getCurrentSkin()`.
- Subscribe to `onSkinChanged`.
- Use the loaded manifest for animation lookup, frame geometry, body sizing, and sprite rendering.
- If a skin lacks an animation used by the behavior system, use `idle` as the fallback animation.

`SettingsApp` displays skin status and calls the skin IPC methods from the "桌宠" section.

## Manifest Compatibility

### Native App Manifest

The current app manifest is already supported:

```json
{
  "id": "lacritomato-mini",
  "displayName": "LacriTomato Mini",
  "spritesheetPath": "spritesheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "columns": 8,
  "rows": 9,
  "animations": {
    "idle": { "frames": [0], "fps": 8, "loop": true }
  }
}
```

### Petdex/Codex Manifest

Petdex packages are normalized into the native app manifest. If a Petdex manifest contains explicit frame size, atlas dimensions, or animation state metadata, use those values. If it omits them, infer:

- `frameWidth = 192`
- `frameHeight = 208`
- `columns = imageWidth / frameWidth`
- `rows = imageHeight / frameHeight`

The service should inspect the spritesheet image size through Electron `nativeImage` or another already-available local image metadata path. It rejects atlases that are not evenly divisible by the frame dimensions.

### Animation Mapping

If the incoming manifest already has `animations`, preserve compatible animation entries after validation.

If the incoming manifest is Petdex/Codex row-state oriented, synthesize app animations:

| App animation | Preferred Petdex state | Fallback |
| --- | --- | --- |
| `idle` | `idle` | first row frames |
| `walkRight` | `run` | `idle` |
| `walkLeft` | `run` reversed or same frames | `walkRight` |
| `attentive` | `wave` | `jump`, then `idle` |
| `happy` | `jump` | `wave`, then `attentive` |
| `thinking` | `review` | `idle` |
| `sleepy` | `idle` | `idle` |

If the manifest has no state metadata at all, assume row order:

1. `idle`
2. `wave`
3. `run`
4. `failed`
5. `review`
6. `jump`
7. `extra1`
8. `extra2`

Only frames that exist inside the atlas bounds are emitted.

## Security Rules

1. Renderer never receives raw authority to read local paths.
2. `importSkinFolder()` only imports a folder selected through Electron's directory picker.
3. `spritesheetPath` must be a relative filename inside the selected folder.
4. Reject paths with drive roots, UNC roots, `..`, or path separators that escape the folder.
5. Accept only `.webp` and `.png` spritesheets.
6. Do not load remote spritesheet URLs as the active skin in phase one.
7. Do not execute files from the pet folder.
8. Cap manifest parsing to normal JSON data. Unknown fields are ignored.
9. If anything fails, return to bundled skin and surface a warning.

## Error Handling

User-visible messages should be short and actionable:

- Missing manifest: "未找到 pet.json"
- Missing spritesheet: "未找到 spritesheet.webp 或 spritesheet.png"
- Invalid JSON: "pet.json 格式不正确"
- Unsafe path: "皮肤图片路径不安全"
- Invalid atlas: "皮肤图片尺寸不符合动画网格"
- Missing animation data after normalization: "皮肤动画信息不完整"

`PetApp` and `SettingsApp` should remain usable in every failure mode.

## Testing Strategy

### Unit Tests

Add focused unit tests for `petSkinService` and shared manifest helpers:

- Loads bundled fallback skin.
- Accepts the existing native `PetManifest` shape.
- Accepts a minimal Petdex-style folder with `pet.json` and `spritesheet.webp`.
- Rejects missing `pet.json`.
- Rejects missing spritesheet.
- Rejects unsafe `spritesheetPath` values.
- Synthesizes required app animations from row-state Petdex data.
- Falls back to bundled skin when configured custom skin is invalid.

Update config tests:

- `defaultAppConfig.pet.skinSourcePath` is `""`.
- Existing config files merge safely with the new field.

### IPC Tests

Extend `registerCoreIpc` tests:

- Import cancel returns `undefined`.
- Import success persists `pet.skinSourcePath`.
- Reset clears `pet.skinSourcePath`.
- Skin change broadcasts to renderer windows.

### Renderer Tests

Extend `SettingsApp.test.tsx`:

- The "桌宠" section shows current skin details.
- Import button calls `pet.importSkinFolder`.
- Reset button calls `pet.resetSkin`.
- Open Petdex button calls `pet.openPetdex`.
- Warning status is shown when fallback is used.

Extend `PetApp.test.tsx`:

- Pet app requests current skin on mount.
- Dynamic manifest dimensions affect body sizing.
- Skin changed event swaps the active spritesheet and manifest.
- Missing custom animation falls back to idle.

## Acceptance Criteria

1. A user can open Settings -> 桌宠 -> 导入皮肤文件夹 and select a valid Petdex pet folder.
2. The visible desktop pet changes to the selected skin without restarting the app.
3. The selected skin persists after app restart.
4. A user can click "打开 Petdex" from Settings and reach the Petdex gallery.
5. A user can restore the bundled LacriTomato Mini skin.
6. Invalid or deleted custom skins never break the pet window. The app uses bundled fallback and shows a warning.
7. Renderer code does not directly read arbitrary local files.
8. Tests cover validation, config migration, IPC, Settings UI, and PetApp runtime skin loading.

## Future Phase: Embedded Petdex or One-Click Install

After local import is stable, add a second design for deeper Petdex integration. Candidate approaches:

1. Use the Petdex public manifest API to build an in-app gallery and download pet files through trusted main-process code.
2. Register a custom protocol such as `lacritomato-petdex://install/<slug>` if Petdex can link to it.
3. Embed the Petdex website in a constrained BrowserWindow and intercept downloads, but only after defining navigation, download, and origin restrictions.

The recommended next step is approach 1 because it avoids injecting behavior into a third-party website and keeps local file writes under app-controlled IPC.
