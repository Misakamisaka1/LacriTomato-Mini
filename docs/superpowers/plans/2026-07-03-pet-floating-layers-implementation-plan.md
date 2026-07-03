# Pet Floating Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop pet, menu, and bubble jitter by keeping the main pet window stable and moving bubble/menu UI into independent transparent overlay windows.

**Architecture:** The main pet window renders only the pet sprite and sends bubble/menu state to the main process. The main process owns overlay windows for bubble and menu layers, sizes them independently, and positions them from the current pet window bounds. Pet height changes still resize the main pet window to the sprite's configured size.

**Tech Stack:** Electron `BrowserWindow`, React renderer routes, existing preload IPC bridge, Vitest unit and renderer tests.

---

### Task 1: Replace Content Resize Semantics With Pet Size Sync

**Files:**
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/registerCoreIpc.ts`
- Modify: `tests/unit/petWindowResize.test.ts`

- [ ] Add a `petSyncBodySize` IPC channel and preload API method that accepts `width` and `height`.
- [ ] Change main-process resizing to anchor the pet body bottom-center and ignore menu/bubble dimensions.
- [ ] Update tests to expect resizing only for sprite size changes.

### Task 2: Add Bubble And Menu Overlay Windows

**Files:**
- Create: `src/main/windows/createPetBubbleWindow.ts`
- Create: `src/main/windows/createPetMenuWindow.ts`
- Modify: `src/main/ipc/registerCoreIpc.ts`
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/petOverlayWindows.test.ts`

- [ ] Add IPC channels for showing/hiding bubble and menu overlays.
- [ ] Create transparent frameless overlay windows with `skipTaskbar`, `hasShadow: false`, and always-on-top behavior matching the pet window.
- [ ] Position overlays from pet bounds and clamp them inside the display work area.
- [ ] Add unit tests for top, left, and right menu placement plus bubble positioning.

### Task 3: Route Overlay Renderers

**Files:**
- Modify: `src/renderer/router.tsx`
- Create: `src/renderer/shell/PetBubbleLayer.tsx`
- Create: `src/renderer/shell/PetMenuLayer.tsx`
- Modify: `src/renderer/shell/PetApp.css`
- Test: `tests/renderer/PetApp.test.tsx`
- Test: `tests/renderer/PetHeadMenu.test.tsx`

- [ ] Add `view=pet-bubble` and `view=pet-menu` routes.
- [ ] Move bubble markup into `PetBubbleLayer`.
- [ ] Reuse `PetHeadMenu` in `PetMenuLayer`.
- [ ] Keep shared CSS stable and remove layout rules that depended on an enlarged `.pet-root`.

### Task 4: Simplify PetApp

**Files:**
- Modify: `src/renderer/shell/PetApp.tsx`
- Test: `tests/renderer/PetApp.test.tsx`

- [ ] Remove bubble/menu content-size calculations from the pet body renderer.
- [ ] Keep only sprite size calculation from `config.pet.defaultHeight`.
- [ ] Send bubble/menu show-hide state to overlay IPC.
- [ ] Confirm menu opening no longer waits for the main pet window to resize.

### Task 5: Verify

**Commands:**
- `npm test -- tests/unit/petWindowResize.test.ts tests/unit/petOverlayWindows.test.ts tests/renderer/PetApp.test.tsx tests/renderer/PetHeadMenu.test.tsx`
- `npm run typecheck`

**Expected:** All targeted tests pass and TypeScript reports no errors.
