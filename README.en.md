# LacriTomato Mini Petdex

[中文 README](README.md)

A Windows-first Electron desktop pet platform. LacriTomato Mini combines a desktop pet, translation, screenshots/OCR, screen recording, and pet chat in a lightweight plugin shell for personal productivity and companionship.

## Features

- **Desktop pet:** A transparent, always-on-top pet window with dragging, show/hide, opacity, size, animation speed, and wandering controls.
- **Pet care:** Affection, fullness, and mood decay over time. Feed, give snacks, play, or pet your companion to trigger different reactions.
- **Pet vitals bar:** A compact floating status card beside the pet. The collapsed view shows three mini progress bars and bond level; the expanded view shows detailed values, bond progress, interaction counts, and care actions. It appears when you click the pet by default, can stay visible, and supports custom positioning.
- **Pet skins:** Browse, preview, download, and apply skins from the built-in Petdex library. You can also import a local folder containing `pet.json` and `spritesheet.webp` or `spritesheet.png`.
- **Skin management:** Switch between or delete downloaded skins from “My Skins”. Failed skins automatically fall back to the built-in LacriTomato Mini skin.
- **Pet menu:** Right-click the pet to open a horizontal avatar menu. Plugin states refresh automatically when they change.
- **Translation plugin:** Works with OpenAI-compatible APIs, with DeepSeek as the default configuration. Save an API key, choose source and target languages, and keep translation history.
- **Quick translation:** Copy selected text, open the translation panel, and start translating automatically.
- **Screenshot plugin:** Region capture, window targeting, copy, save, pin-to-screen, rectangle/arrow/brush/text/mosaic annotations, and OCR overlays.
- **Local OCR:** Includes `chi_sim.traineddata` and `eng.traineddata` for local recognition. Model-based OCR is reserved for a future implementation.
- **Screen recording:** Records through an FFmpeg sidecar process with system audio, microphone, quality, FPS, bitrate, mixed or separate tracks, and an option to hide the pet while recording.
- **Pet chat:** A standalone chat window using the saved model configuration, with history, long-term memory, personality templates, and proactive topics.
- **Settings:** Manage models, shortcuts, OCR, screenshots, recording, pet behavior, pet care, chat, and plugin toggles in one window.
- **Shortcut system:** Supports two or three-key combinations and re-registers runtime shortcuts after settings are saved.

## Tech stack

- Electron 36
- React 19
- Vite 6
- TypeScript 5.8
- Vitest + Testing Library
- Tesseract.js
- electron-builder

## Quick start

```powershell
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1
npm run typecheck
npm test
npm start
```

Notes:

- `npm start` builds the renderer, preload, and main process before launching Electron.
- Run `npm run dev` to start the Vite renderer development server.
- If you do not need screen recording yet, skip the recording asset preparation. Screenshots, translation, and chat do not depend on FFmpeg.

## Screen recording assets

Before using screen recording for the first time, prepare FFmpeg and the WASAPI loopback helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1
```

The script will:

- Download a Windows FFmpeg GPL build to `assets/recording/ffmpeg.exe`.
- Publish the project WASAPI helper to `assets/recording/wasapi-loopback-helper.exe`.
- Stream system audio to FFmpeg as `s16le / 48000Hz / 2ch` PCM without buffering media data in the application process.

If `ffmpeg.exe` is already present, publish only the helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1 -SkipFfmpegDownload
```

The default FFmpeg build includes `libx264`. Re-evaluate the FFmpeg build and its licenses before closed-source commercial distribution.

## Models and data

- Default model service: `https://api.deepseek.com`
- Default model: `deepseek-v4-flash`
- API keys are stored through the application's secret service and are not written to the repository.
- Screenshots are saved in the user data directory under `screenshots`.
- Recordings are saved in the user data directory under `recordings`.
- Skins downloaded from Petdex are saved in the user data directory under `petdex-skins`.
- Chat history and long-term memory are stored in the user data directory and controlled by the history limit and memory settings.
- Pet care data is stored in `pet-vitals.json`; decay is calculated for time spent while the app was closed, up to 72 hours.

## Pet care

The pet has three values that slowly decay over time. Decay rates can be adjusted or disabled in Settings → Care.

| Value | Description |
| --- | --- |
| Affection | Increases through interactions and decreases when the pet is ignored for a long time. |
| Fullness | Mainly restored by feeding. The pet reminds you when it is hungry. |
| Mood | Restored by playing and giving snacks; it decays more slowly when the pet is full. |

Each interaction has its own cooldown and requirements:

| Interaction | Effect | Cooldown |
| --- | --- | --- |
| Feed | Fullness +26, mood +5, affection +2 | 45 seconds |
| Snack | Mood +16, fullness +8, affection +3 | 90 seconds |
| Play | Mood +22, affection +4, fullness -9 | 30 seconds |
| Pet | Mood +7, affection +3 | 6 seconds |

Interactions also add bond points. Reaching each threshold increases the bond level, from “First Meeting” to “Soul Bond” across 10 levels. Bond points never decrease, and affection loss cannot reduce the bond level. The first interaction of each day receives a bonus.

The vitals bar has two states:

1. **Collapsed:** Bond level ring, pet name, mood label, and three mini progress bars.
2. **Expanded:** Percentage progress bars, four interaction buttons with cooldowns and effect previews, bond progress, interaction counts, and a link to Care Settings.

The vitals bar has three display modes under Settings → Care → Vitals bar display:

1. **Show when pet is clicked (default):** Hidden until you click the pet, then shown beside its head. Clicking anywhere outside the pet or vitals bar collapses it.
2. **Always show:** Remains beside the pet.
3. **Do not show:** Hidden until opened from the pet menu or tray menu.

It also has three positioning modes:

1. **Follow pet (default):** Automatically stays beside the pet's head and flips sides near a screen edge.
2. **Free position:** Drag the vitals bar title area to place it anywhere; the position is remembered after restarting.
3. **Reset anytime:** Choose “Return to pet” in the bar or “Follow pet” in Care Settings to restore automatic positioning.

Dragging keeps the bar inside the current display's work area so it does not fall behind the taskbar or outside the screen.

## Pet skins

You can use skins in three ways:

1. Browse or search [Petdex](https://petdex.dev/) in Settings → Skin Library, then choose “Download and apply”.
2. Manage downloaded skins in “My Skins”. Switch away from the active skin before deleting it.
3. In the Desktop Pet section, choose “Import skin folder” and select a folder containing `pet.json` and `spritesheet.webp` or `spritesheet.png`.

The Petdex library requires an internet connection. The app accepts HTTPS downloads only from `petdex.dev` and `assets.petdex.dev`. Missing, invalid, or incompatible skins are kept or replaced with the built-in LacriTomato Mini skin.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install Node dependencies |
| `npm run dev` | Start the Vite renderer development server |
| `npm run typecheck` | Type-check the renderer and main process |
| `npm test` | Run Vitest tests |
| `npm run build` | Build the renderer, preload, and main process |
| `npm start` | Build and launch Electron |
| `npm run dist` | Build the Windows NSIS installer |

## Default shortcuts

| Function | Shortcut |
| --- | --- |
| Screenshot | `Ctrl+Shift+A` |
| Open translation | `Ctrl+Shift+T` |
| Quick translate selection | `Ctrl+Shift+Y` |
| Show/hide pet | `Ctrl+Shift+P` |
| Start/stop recording | `Ctrl+Shift+R` |

## Project structure

```text
assets/                 Pet assets, OCR data, and recording runtime resources
docs/                   Design documents and implementation plans
scripts/                Recording asset preparation scripts
src/main/               Electron main process, windows, and system services
src/plugins/            Translation, screenshot, chat, and recording plugins
src/preload/            APIs safely exposed to the renderer
src/renderer/           Pet shell, settings, and shared UI
src/shared/             Config schemas, IPC channels, plugin types, and shared logic
tests/                  Unit and renderer tests
tools/recording/        WASAPI loopback helper source
```

## Packaging and release notes

- `release/`, `dist/`, `node_modules/`, `.tmp/`, `.nuget/`, and recording `.exe` artifacts are not committed to Git.
- `assets/recording/README.md` documents how to prepare recording runtime files.
- Build the NSIS installer with `npm run dist`. Before publishing, manually smoke-test installation, uninstallation, upgrades, startup behavior, and shortcut conflicts.
- Every packaged version must use a new version number and be published as a matching GitHub Release with its Windows installer attached. See [`AGENTS.md`](AGENTS.md) for the repository release workflow.

## Roadmap

- Model OCR: The screenshot overlay already supports local OCR; model OCR is reserved for a future implementation.
- Recording QA: Continue validating system audio, microphone, and separate-track output on more Windows devices.
- Installer QA: Complete pre-release checks for installation, uninstallation, startup, and upgrades.
