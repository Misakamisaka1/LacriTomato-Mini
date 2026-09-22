# Pet Vitals Care System Implementation Plan

**Goal:** Add 好感度 / 饱食度 / 心情 meters, 喂食 / 零食 / 玩耍 / 抚摸 care actions and a polished, always-available 状态栏 to the desktop pet, using the existing dark theme.

**Architecture:** A pure shared vitals module owns all math. The main process owns state, persistence, the decay heartbeat, care notifications and the status overlay window; the preload bridge exposes narrow IPC methods; the renderer renders the compact/expanded status card and the 养成 settings section.

**Tech Stack:** Electron 43, React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, lucide-react.

---

## File Structure

- Create `src/shared/petVitals.ts`: meters, action catalog, decay, bond levels, warnings, panel sizes.
- Modify `src/shared/configSchema.ts`: add the `vitals` config section and defaults.
- Modify `src/shared/ipcChannels.ts`: add pet vitals and status-overlay channels.
- Modify `src/main/services/configService.ts`: merge the `vitals` section on update.
- Create `src/main/services/petVitalsService.ts`: persistence, decay ticker, care notifications.
- Modify `src/main/windows/petOverlayWindows.ts`: `createPetStatusWindow` and `getPetStatusOverlayLayout`.
- Modify `src/main/ipc/registerCoreIpc.ts`: vitals handlers, status overlay lifecycle, snapshot broadcast.
- Modify `src/main/app.ts`: instantiate the service, react to needs/actions, tray + menu entry, config sync.
- Modify `src/preload/api.ts`, `src/preload/index.ts`: expose `pet.vitals`.
- Create `src/renderer/components/PetVitalsBar.tsx`, `src/renderer/components/PetVitalsPanel.tsx`.
- Create `src/renderer/shell/PetVitals.css`, `src/renderer/shell/PetVitalsLayer.tsx`.
- Modify `src/renderer/router.tsx`: add the `pet-status` view.
- Modify `src/renderer/shell/PetApp.tsx`, `src/renderer/components/PetHeadMenu.tsx`, `src/renderer/shell/PetApp.css`: 状态 menu key and vitals-driven sprite tint.
- Modify `src/renderer/shell/SettingsApp.tsx`, `src/renderer/shell/SettingsApp.css`: 养成 section.
- Test `tests/unit/petVitals.test.ts`, `tests/unit/petVitalsService.test.ts`, `tests/unit/petVitalsLayout.test.ts`.
- Test `tests/renderer/PetVitalsPanel.test.tsx`, `tests/renderer/PetVitalsLayer.test.tsx`, `tests/renderer/SettingsVitals.test.tsx`.
- Modify `tests/renderer/PetApp.test.tsx`: head menu width now includes the 状态 key.

## Task 1: Shared Vitals Domain

- [x] Add meters, decay with a 72 hour offline cap, mood/satiety coupling.
- [x] Add the action catalog with cooldowns, requirements, effects, reactions and bond points.
- [x] Add bond levels, mood/status labels, warnings, need events and panel sizes.

## Task 2: Main Process State

- [x] Persist `pet-vitals.json`, normalize corrupted files and apply offline decay on load.
- [x] Tick decay every 30 seconds, persist at most once a minute, broadcast snapshots.
- [x] Emit one care notification per critical condition with a quiet window.

## Task 3: Status Overlay Window

- [x] Add a transparent, frameless, always-on-top card window that loads once and follows IPC.
- [x] Place it beside the pet, flip at screen edges and clamp inside the work area.
- [x] Reposition with pet movement and hide together with the pet window.
- [x] Support a dragged free position: `hudPosition` in config, delta IPC, work-area clamping, tail offset and a follow-the-pet reset.

## Task 4: Renderer Card

- [x] Build the compact HUD (bond ring, name, mood chip, three meters) and the expanded card.
- [x] Add cooldown countdowns, requirement-aware buttons, effect toasts, warnings and bond progress.
- [x] Style everything with the existing dark theme plus rose/amber/violet accents and motion.
- [x] Add header drag with a 4px threshold, a grab cursor, a live drag style and a position row with 回到宠物身边.

## Task 5: Settings and Menu Integration

- [x] Add the 养成 settings section with live meters, quick actions, card toggle, reset and decay rates.
- [x] Add 状态栏跟随宠物 plus a save-time position re-read so settings cannot clobber a drag.
- [x] Add the 状态 head-menu key, tray entry and per-state sprite tint.

## Task 6: Verification

- [x] `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit` pass.
- [x] New vitest suites pass; the only failing suites are the pre-existing `TranslatorPanel` jsdom `localStorage` failures.
- [x] `vite build`, preload build and main build succeed, and the packaged entry starts without errors and keeps a stored card position.

## Task 7: On-demand Card (Follow-up)

- [x] Replace itals.showHud with itals.hudMode (lways / click / hidden, default click).
- [x] Report left clicks on the pet window over pet:vitals:status:pet-click (a drag is not a click).
- [x] Summon the card on a pet click, dismiss it on an outside click, and hide it when it loses focus while focused by a summon.
- [x] Focus the card only while it is summoned, and never hide it while the pointer is on the card itself.
- [x] Park the automatic card beside the pet head using the renderer-reported sprite size, 8px away.
- [x] Drop the redundant outer card shadow (and dim the toast/ring glows) so the popup stops painting a dark halo.
- [x] Cover the mode rules with IPC tests, the head placement with layout tests, the pet click reporting with PetApp tests and the mode switch with settings tests.
