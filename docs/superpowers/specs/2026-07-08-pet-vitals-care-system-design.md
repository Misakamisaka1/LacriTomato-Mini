# Pet Vitals Care System Design

## Goal

Give the desktop pet a light tamagotchi loop: visible 好感度 / 饱食度 / 心情 meters, care actions (喂食、零食、玩耍、抚摸), a bond level that rewards long-term care, and an always-available 状态栏 that looks like the rest of the app.

## Data Model

- `affinity` (好感度), `satiety` (饱食度) and `mood` (心情) are current meters on a 0-100 scale.
- `points` are lifetime 羁绊点数. They never decay, so the bond level (10 titles, from 初次相遇 to 灵魂羁绊) is permanent progress.
- Decay is time based and computed on read, so it also applies while the app is closed (capped at 72 hours offline).
- State lives in `pet-vitals.json` inside the Electron user data directory; the config keeps the tunable decay rates.

## Decision

Keep all pet-vitals math in a pure shared module (`src/shared/petVitals.ts`) so the main process, the renderer and the tests share one implementation. The main process owns the state, persistence, decay heartbeat and care notifications; renderers only send actions and render snapshots.

The 状态栏 is a separate transparent overlay window, following the existing pet bubble/menu layer design instead of resizing the pet window:

- Compact card: bond ring, pet name, mood chip and three slim meters. Clicking it expands the card.
- Expanded card: meters with numeric values, four care buttons with cooldowns and effect previews, bond progress, care warnings, interaction totals, a position row and a shortcut to the 养成 settings section.
- The card prefers the right side of the pet and flips to the left near the screen edge, clamped inside the display work area. It hangs at the pet's head rather than at its feet, so it reads as attached to the sprite even when the sprite only fills part of its transparent window (the main process uses the last body size reported by the renderer).
- `config.vitals.hudMode` picks how it appears: `click` (default) waits for a left click on the pet, `always` pins it next to the pet, `hidden` keeps it off until the pet head menu (状态) or the tray summons it.

## Showing the card on demand

`hudMode: "click"` keeps the desktop clear: the card only exists between a click on the pet and the next click somewhere else.

- The pet renderer reports every left click on the pet window over `pet:vitals:status:pet-click` with `inside: true` when the pointer was over the pet body. A drag (more than 3px of travel) is not a click and is never reported.
- Clicking the pet body summons the card and gives it focus; clicking the empty space around the pet dismisses it.
- Clicking anything else (another app, the desktop) cannot be observed from the renderer, so the card window itself is the sensor: while summoned it is focused, and losing focus (`blur`) hides it after a 180ms grace period. A pet click inside that window cancels the pending hide, so clicking the same pet twice never flickers.
- The card never hides while the pointer is on it: the card is its own window and keeps focus while it is being used.
- A gesture always wins over the manual toggle: clicking the pet clears a manual hide, and clicking outside clears a manual show, so the mode stays predictable. `always` and `hidden` ignore pet clicks completely, and both modes still respond to the head menu and tray toggles.
- Hiding the pet forgets a summoned card, so the card never reappears on its own after the pet comes back.
- Click mode is about a card that lives next to the pet, so picking it in the settings returns a freely placed card to `auto`, and a config written before `hudMode` existed keeps its pinned position only if it also stored a mode.

The summoned card is placed next to the pet's head (10px tighter gap than before) and uses a single tight drop shadow instead of the former double halo, which keeps the small popup from painting a dark ring over the desktop.

## Dragging the card

The card has two anchor modes, both stored in `config.vitals.hudPosition`:

- `null` (default, `auto`): the card follows the pet and is re-placed on every pet move, flipping sides at screen edges.
- `{ x, y }` (`custom`): the user dragged the card, so it stays at that screen position and no longer follows the pet.

Interaction rules:

- Dragging starts from the card header once the pointer travels more than 4px, so a plain click still expands or collapses the card. The click that follows a drag is swallowed.
- Each drag step sends a screen-space delta over IPC; the main process moves the window and clamps the position into the work area of the display it is being dropped on.
- Nothing is written to disk while the pointer is down. The position is pinned (and persisted) when the drag ends, and a session-only position is also written on quit, so a crash-free exit never loses a drag.
- The card keeps a small tail pointing at the pet: the main process reports the pet's centre relative to the card, and the renderer applies it as `--pv-tail-top`.
- Settings offers 状态栏跟随宠物 to go back to `auto`, and a settings save re-reads the live position first so it cannot overwrite a drag that happened while the window was open.

## Behavior

- Care actions consume cooldowns (抚摸 6s, 玩耍 30s, 喂食 45s, 零食 90s) and enforce requirements: a full pet refuses more food, a starving pet refuses to play.
- 玩耍 spends satiety, 零食 trades satiety for mood, and every action grants bond points; the first interaction of a day grants a bonus.
- Low satiety drains mood faster; a satisfied pet keeps its mood longer.
- When a meter goes critical the pet shows a reaction bubble once per condition, and the card pulses a warning; the sprite is tinted so mood reads at a glance.
- `vitals.enabled` pauses decay, notifications and the automatic HUD; `vitals.hudMode` decides whether the card is pinned, summoned by a click or hidden; `vitals.notifications` silences the care bubbles; the 养成 settings section can also trigger actions, toggle the card and reset the state.

## Testing

Unit tests cover decay math, action effects, cooldowns, requirements, bond levels, warnings, need notifications and persistence/offline decay. Layout tests cover the overlay placement (including the sprite-aware head position), and renderer tests cover the card interactions, the overlay layer, the pet click reporting and the settings section. `registerCoreIpc.petVitalsStatus.test.ts` drives the click-mode visibility rules (summon, dismiss, blur grace period, mode-specific behaviour) with a fake card window.