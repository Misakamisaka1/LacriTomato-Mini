# Screen Recording Design

## Goal

Add a Windows-first screen recording feature to LacriTomato Mini that can record screen video, system audio, and microphone audio while keeping Electron memory usage low.

## Scope

This feature adds a new recording plugin and main-process recording service. It integrates with the existing pet menu, global shortcuts, settings window, preload API, IPC registration, and local config service. It does not replace the existing screenshot workflow, OCR workflow, translator, chat, pinned image, or pet sprite behavior.

## Product Requirements

- Users can start and stop screen recording from the pet menu.
- Users can record the full display in the first implementation.
- Users can choose a quality preset: original, 1080p, 720p, or 480p.
- Users can choose FPS: 15, 30, or 60.
- Users can choose whether to record system audio.
- Users can choose whether to record microphone audio.
- System audio recording must work without requiring users to install a virtual audio device.
- Users can choose whether system audio and microphone audio are mixed into one track or kept as separate tracks.
- Recordings are saved directly to disk under the app user data directory by default.
- The pet shows recording state, elapsed time, stop action, success messages, and useful failure messages.
- The recording pipeline must not buffer video frames or full recording blobs in renderer or main-process memory.

## Existing Context

- The app is an Electron, Vite, React, TypeScript desktop pet platform.
- `src/plugins/screenshot/manifest.ts` already demonstrates a plugin contribution with menu items, shortcuts, settings sections, and capabilities.
- `src/main/services/screenshotService.ts` uses Electron `desktopCapturer` for still image capture. That approach stores PNG data in memory and is appropriate for screenshots, not long-running video recording.
- `src/main/app.ts` owns plugin registration, shortcut registration, pet bubble messages, and feature action dispatch.
- `src/shared/configSchema.ts`, `src/shared/ipcChannels.ts`, `src/preload/api.ts`, and `src/preload/index.ts` define the current config and IPC boundaries.
- `src/renderer/shell/SettingsApp.tsx` hosts plugin settings sections and should receive a new recording section.

## Recommended Architecture

Use a small orchestration layer in Electron and keep the heavy recording work outside the JS heap.

- The main process owns `recordingService`.
- The service starts and stops a bundled FFmpeg process for video encoding, muxing, scaling, and file output.
- Screen video is captured by FFmpeg using the best available Windows capture backend.
- System audio is captured through a Windows WASAPI loopback helper and streamed to FFmpeg as PCM.
- Microphone audio is captured by FFmpeg from the selected DirectShow device.
- Renderer code only invokes recording actions and displays status. It never receives raw frame data, raw audio buffers, or encoded video chunks.

This design makes the app behave like a normal recorder: users can record system audio by default, and virtual audio devices are only a compatibility fallback when the primary loopback path fails.

## Recording Engine

### Video Capture

The FFmpeg process records the display directly and writes the encoded container to disk.

Preferred Windows video backend order:

1. `gfxcapture`, because it uses Windows Graphics Capture and supports monitor/window capture, scaling, frame-rate caps, cursor capture, and GPU-friendly flows in modern FFmpeg builds.
2. `ddagrab`, because it uses Desktop Duplication API and returns D3D11 hardware frames suitable for hardware encoding.
3. `gdigrab`, as a broad compatibility fallback when newer backends are unavailable.

Preferred encoder order:

1. `h264_nvenc`
2. `h264_qsv`
3. `h264_amf`
4. `h264_mf`
5. `libx264` with a fast preset

The service probes available encoders and capture backends once per app session and stores the result in memory. It selects the first working combination for each recording.

### System Audio

System audio is captured with WASAPI loopback. This captures the current default output device, such as speakers, headphones, HDMI, Bluetooth output, or USB audio output.

Implementation boundary:

- Create a small Windows loopback helper executable or native utility process.
- The helper opens the default render endpoint in loopback mode.
- The helper emits 48 kHz stereo signed 16-bit PCM to stdout or to a named pipe.
- The main process connects that PCM stream to FFmpeg as an audio input.
- The helper exits when recording stops or when the output device disappears.

This path avoids installing virtual audio devices and avoids keeping large audio buffers in Electron memory.

Fallback order for system audio:

1. WASAPI loopback helper.
2. Electron/Chromium desktop audio loopback if available and reliable for the selected display.
3. DirectShow devices that are already present, such as Stereo Mix or a user-installed virtual audio device.
4. Continue video and microphone recording with a warning that system audio could not be captured.

### Microphone Audio

Microphone audio is captured through FFmpeg DirectShow input. The app lists available DirectShow audio devices and stores the selected device name in config.

The default microphone option means FFmpeg uses the current default recording device when possible. If the configured device is missing, the service falls back to no microphone and shows a warning after recording starts.

### Audio Mixing

Supported audio modes:

- `mixed`: system audio and microphone audio are mixed into one AAC track.
- `separate`: system audio and microphone audio are written as separate AAC tracks.

For `mixed`, FFmpeg uses `amix` and normalizes both audio inputs to 48 kHz stereo before mixing. For `separate`, FFmpeg maps each audio input to its own track and labels track metadata as `System Audio` and `Microphone`.

## Configuration

Add `recording` to `AppConfig`:

- `enabled: boolean`
- `saveDirectoryName: string`
- `filenamePattern: string`
- `qualityPreset: "original" | "1080p" | "720p" | "480p"`
- `frameRate: 15 | 30 | 60`
- `videoBitrateKbps: number`
- `recordSystemAudio: boolean`
- `recordMicrophone: boolean`
- `microphoneDeviceName: string`
- `audioMode: "mixed" | "separate"`
- `captureCursor: boolean`
- `hidePetWhenRecording: boolean`

Defaults:

- Enabled: true.
- Save directory: `recordings`.
- Filename pattern: `lacritomato-recording-yyyyMMdd-HHmmss`.
- Quality preset: `1080p`.
- FPS: 30.
- Video bitrate: 8000 Kb/s.
- Record system audio: true.
- Record microphone: false.
- Microphone device name: empty string for default device.
- Audio mode: mixed.
- Capture cursor: true.
- Hide pet while recording: true.

The config service must merge old persisted configs with these defaults so existing installs receive the new fields.

## Plugin Contributions

Add a `recording` plugin manifest:

- Menu item: `录屏`
- Action: `recording.toggle`
- Shortcut: `CommandOrControl+Shift+R`
- Settings section: `录屏`
- Capabilities: `screen:record`, `audio:system-loopback`, `audio:microphone`, `file:save`

The pet menu item toggles between starting and stopping recording based on current recording state.

## Main Process Service

Create `src/main/services/recordingService.ts` with a small public interface:

- `getState(): RecordingState`
- `start(config: AppConfig["recording"]): Promise<RecordingStartResult>`
- `stop(): Promise<RecordingStopResult>`
- `listAudioDevices(): Promise<RecordingAudioDevice[]>`
- `onStateChanged(callback): () => void`

Responsibilities:

- Resolve the output path.
- Probe FFmpeg capabilities.
- Probe microphone devices.
- Start the system audio helper when system audio is enabled.
- Spawn FFmpeg with explicit argument arrays, not shell strings.
- Pipe system audio PCM into FFmpeg.
- Track recording state, start time, output path, and warnings.
- Stop gracefully by writing `q` to FFmpeg stdin when available.
- Kill the process after a short timeout if graceful stop fails.
- Clean up the helper process and pipes.
- Never store recording frame data or complete video data in memory.

## IPC and Preload

Add recording IPC channels:

- `recording:state:get`
- `recording:start`
- `recording:stop`
- `recording:devices:list-audio`
- `recording:state:changed`

Expose them as `window.petdex.recording`:

- `getState()`
- `start()`
- `stop()`
- `listAudioDevices()`
- `onStateChanged(callback)`

The renderer calls these methods only for control and status. It does not receive media streams.

## Settings Experience

Add a recording settings section with compact desktop-style controls:

- Quality preset segmented control.
- FPS segmented control.
- Video bitrate numeric input.
- System audio toggle.
- Microphone toggle.
- Microphone device select.
- Audio mode select.
- Cursor capture toggle.
- Hide pet while recording toggle.
- Save directory name input.
- Filename pattern input.

When system audio is enabled, the UI should not mention virtual audio devices as part of the normal path. If the runtime reports system audio unavailable, show a concise troubleshooting message in the recording result or status area.

## Pet Experience

When recording starts:

- Hide the pet if `hidePetWhenRecording` is enabled.
- Show a short bubble before hiding: `开始录屏`.
- Keep the app tray alive.
- Update menu state so the recording action becomes `停止录屏`.

When recording stops:

- Restore the pet if it was hidden by recording.
- Show a bubble with the saved file path or a short success message.
- If audio had warnings, include one concise warning in the bubble and keep detailed diagnostics in logs.

When recording fails:

- Restore the pet if it was hidden.
- Show a concise failure message.
- Keep partial files only when FFmpeg produced a playable file; otherwise delete the incomplete output.

## Error Handling

- If FFmpeg is missing, show `录屏组件未找到，请重新安装应用。`
- If no supported video backend works, show `屏幕录制启动失败，请检查系统权限或显卡驱动。`
- If system audio loopback fails, continue recording video and microphone when possible and warn `系统声音未录入。`
- If microphone capture fails, continue recording video and system audio when possible and warn `麦克风未录入。`
- If both requested audio sources fail, continue video-only recording and warn `音频未录入。`
- If the output path cannot be created, do not start FFmpeg and show `录屏保存目录不可用。`
- If recording is already active, `start` returns the current active state instead of starting a second process.
- If `stop` is called while idle, it returns the idle state.

## Packaging

Bundle a known FFmpeg build under app resources. The build must include the selected Windows capture backends, AAC audio encoding, H.264 encoding, and common hardware encoders where licensing permits.

Bundle the WASAPI loopback helper under app resources. The helper is started only while recording system audio.

The app should include license notices for FFmpeg and any helper dependencies in the distribution documentation and about/settings surface.

## Testing

Unit tests:

- Config schema accepts recording defaults.
- Config service merges old configs with recording defaults.
- Recording manifest contributes menu item, shortcut, settings section, and capabilities.
- Recording service builds FFmpeg arguments for video-only recording.
- Recording service builds FFmpeg arguments for system audio plus microphone mixed mode.
- Recording service builds FFmpeg arguments for separate audio tracks.
- Recording service refuses duplicate starts.
- Recording service stop returns idle state when already idle.
- Recording service reports warnings for failed optional audio sources.
- Core IPC exposes recording state, start, stop, and audio device listing.
- Preload API exposes `window.petdex.recording`.
- App action dispatch toggles recording through `recording.toggle`.

Renderer tests:

- Pet menu renders the recording action with the correct label.
- Settings app renders recording controls and saves recording config.
- Settings app disables microphone device selection when microphone recording is off.
- Recording status updates when `recording:state:changed` fires.

Manual smoke tests on Windows:

- Record 1080p 30 FPS with system audio enabled and microphone disabled.
- Record 720p 30 FPS with system audio and microphone mixed.
- Record 720p 30 FPS with system audio and microphone as separate tracks.
- Stop recording from the pet menu.
- Confirm the saved MP4 plays in Windows media player with expected audio.
- Confirm Electron memory does not grow with recording duration.

## Non-Goals

- No streaming to RTMP or other live services.
- No webcam overlay in the first implementation.
- No GIF recording in the first implementation.
- No area selection in the first implementation.
- No built-in video editor.
- No cross-platform macOS or Linux support in the first implementation.

## Acceptance Criteria

- Users can start and stop recording from the pet menu.
- The first implementation records the primary display to a playable video file.
- System audio is recorded by default on Windows without installing a virtual audio device.
- Microphone recording can be enabled and disabled.
- Quality preset, FPS, bitrate, cursor capture, audio mode, and save naming settings are persisted.
- Recordings are streamed directly to disk through FFmpeg.
- Electron renderer and main processes do not buffer frames or full video blobs.
- If system audio capture fails, the user receives a clear warning and the app still records video when possible.
- Existing screenshot, translator, chat, settings, and pet menu behavior continues to work.
- Focused unit tests, renderer tests, typecheck, and build pass.
