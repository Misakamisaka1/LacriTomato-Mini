# 屏幕录制功能设计

## 目标

为 LacriTomato Mini 新增一个 Windows 优先的屏幕录制功能，可以录制屏幕画面、系统声音和麦克风声音，同时尽量降低 Electron 进程的内存占用。

## 范围

本功能会新增一个录屏插件和一个主进程录屏服务，并接入现有的宠物菜单、全局快捷键、设置窗口、预加载 API、IPC 注册和本地配置服务。

本功能不替换现有截图、OCR、翻译、聊天、贴图窗口或宠物精灵图行为。

## 产品要求

- 用户可以从宠物菜单开始和停止屏幕录制。
- 第一版支持录制完整显示器。
- 用户可以选择清晰度预设：原始、1080p、720p、480p。
- 用户可以选择帧率：15、30、60 FPS。
- 用户可以选择是否录制系统声音。
- 用户可以选择是否录制麦克风声音。
- 系统声音录制必须默认可用，不能要求用户安装虚拟音频设备。
- 用户可以选择把系统声音和麦克风声音混成一个音轨，或者保留为两个独立音轨。
- 录制文件默认直接保存到应用的用户数据目录下。
- 宠物需要显示录制状态、录制时长、停止入口、成功提示和有用的失败提示。
- 录制管线不能在渲染进程或主进程内缓存视频帧，也不能缓存完整录制 Blob。

## 当前项目背景

- 当前项目是 Electron、Vite、React、TypeScript 桌面宠物应用。
- `src/plugins/screenshot/manifest.ts` 已经展示了插件如何贡献菜单项、快捷键、设置分区和能力声明。
- `src/main/services/screenshotService.ts` 使用 Electron `desktopCapturer` 做静态截图。该方案会把 PNG 数据保存在内存中，适合截图，不适合长时间录屏。
- `src/main/app.ts` 负责插件注册、快捷键注册、宠物气泡提示和功能动作分发。
- `src/shared/configSchema.ts`、`src/shared/ipcChannels.ts`、`src/preload/api.ts`、`src/preload/index.ts` 定义了当前配置和 IPC 边界。
- `src/renderer/shell/SettingsApp.tsx` 承载插件设置页，需要新增录屏设置分区。

## 推荐架构

使用 Electron 做轻量编排，把真正重的录制工作放到 JS 堆外执行。

- 主进程持有 `recordingService`。
- 录屏服务负责启动和停止随应用打包的 FFmpeg 进程。
- FFmpeg 负责视频编码、音视频封装、缩放和文件落盘。
- 屏幕画面由 FFmpeg 使用 Windows 上最合适的捕获后端直接采集。
- 系统声音由 Windows WASAPI loopback 辅助进程采集，再以 PCM 音频流传给 FFmpeg。
- 麦克风声音由 FFmpeg 从 DirectShow 音频设备采集。
- 渲染进程只负责发起录制动作和展示状态，不接收原始视频帧、原始音频缓冲或编码后的视频块。

这样设计后，应用体验应该像正常录屏工具一样：默认可以录系统声音；虚拟音频设备只作为极端兼容兜底，不是正常用户路径。

## 录制引擎

### 视频捕获

FFmpeg 进程直接录制显示器，并把编码后的容器文件写入磁盘。

Windows 视频捕获后端优先级：

1. `gfxcapture`：基于 Windows Graphics Capture，支持显示器/窗口捕获、缩放、帧率上限、鼠标捕获，并且适合现代 FFmpeg 的 GPU 友好流程。
2. `ddagrab`：基于 Desktop Duplication API，返回 D3D11 硬件帧，适合硬件编码。
3. `gdigrab`：作为兼容性兜底，在新后端不可用时使用。

视频编码器优先级：

1. `h264_nvenc`
2. `h264_qsv`
3. `h264_amf`
4. `h264_mf`
5. `libx264`，使用快速预设

录屏服务在每次应用会话中探测一次可用的编码器和捕获后端，并把探测结果保存在内存中。每次录制时选择第一组可用组合。

### 系统声音

系统声音使用 WASAPI loopback 采集。它捕获当前默认输出设备的声音，例如扬声器、耳机、HDMI、蓝牙耳机或 USB 声卡输出。

实现边界：

- 创建一个小型 Windows loopback 辅助可执行文件或原生工具进程。
- 辅助进程以 loopback 模式打开默认渲染端点，也就是当前正在播放声音的输出设备。
- 辅助进程输出 48 kHz、双声道、16 位有符号 PCM 到 stdout 或命名管道。
- 主进程把这条 PCM 流连接给 FFmpeg，作为一个音频输入。
- 录制停止或输出设备消失时，辅助进程退出。

这条路径不需要用户安装虚拟音频设备，也避免在 Electron 内存中保留大块音频缓冲。

系统声音兜底顺序：

1. WASAPI loopback 辅助进程。
2. Electron/Chromium 桌面音频 loopback，前提是当前 Electron 版本对所选显示器稳定可用。
3. 已经存在的 DirectShow 设备，例如 Stereo Mix 或用户自己已有的虚拟音频设备。
4. 如果系统声音无法捕获，继续录制视频和麦克风，并提示用户“系统声音未录入”。

### 麦克风声音

麦克风声音通过 FFmpeg DirectShow 输入采集。应用会列出可用的 DirectShow 音频设备，并把用户选择的设备名保存到配置中。

默认麦克风选项表示尽量使用当前系统默认录音设备。如果配置中的设备不存在，服务会降级为不录麦克风，并在录制开始后给出警告。

### 音频混合

支持两种音频模式：

- `mixed`：系统声音和麦克风声音混成一条 AAC 音轨。
- `separate`：系统声音和麦克风声音分别写成两条 AAC 音轨。

在 `mixed` 模式下，FFmpeg 使用 `amix` 混音，并先把两个音频输入统一成 48 kHz 双声道。

在 `separate` 模式下，FFmpeg 分别映射两个音频输入，并把音轨元数据标记为 `System Audio` 和 `Microphone`。

## 配置

在 `AppConfig` 中新增 `recording`：

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

默认值：

- 启用录屏：true。
- 保存目录：`recordings`。
- 文件名模式：`lacritomato-recording-yyyyMMdd-HHmmss`。
- 清晰度预设：`1080p`。
- 帧率：30 FPS。
- 视频码率：8000 Kb/s。
- 录制系统声音：true。
- 录制麦克风：false。
- 麦克风设备名：空字符串，表示默认设备。
- 音频模式：mixed。
- 捕获鼠标：true。
- 录制时隐藏宠物：true。

配置服务必须把旧版持久化配置和这些新默认值合并，确保老用户升级后也能得到完整录屏配置。

## 插件贡献

新增 `recording` 插件清单：

- 菜单项：`录屏`
- 动作：`recording.toggle`
- 快捷键：`CommandOrControl+Shift+R`
- 设置分区：`录屏`
- 能力声明：`screen:record`、`audio:system-loopback`、`audio:microphone`、`file:save`

宠物菜单中的录屏项根据当前状态切换：未录制时显示开始录屏，录制中显示停止录屏。

## 主进程服务

创建 `src/main/services/recordingService.ts`，提供一个小而清晰的公共接口：

- `getState(): RecordingState`
- `start(config: AppConfig["recording"]): Promise<RecordingStartResult>`
- `stop(): Promise<RecordingStopResult>`
- `listAudioDevices(): Promise<RecordingAudioDevice[]>`
- `onStateChanged(callback): () => void`

职责：

- 解析输出文件路径。
- 探测 FFmpeg 能力。
- 探测麦克风设备。
- 在启用系统声音时启动系统声音辅助进程。
- 使用明确的参数数组启动 FFmpeg，不拼接 shell 字符串。
- 把系统声音 PCM 流传给 FFmpeg。
- 跟踪录制状态、开始时间、输出路径和警告信息。
- 停止时优先向 FFmpeg stdin 写入 `q`，让它优雅结束。
- 如果优雅停止超时，再强制结束进程。
- 清理辅助进程和管道。
- 绝不在内存里保存录制帧数据或完整视频数据。

## IPC 和预加载 API

新增录屏 IPC 通道：

- `recording:state:get`
- `recording:start`
- `recording:stop`
- `recording:devices:list-audio`
- `recording:state:changed`

在 `window.petdex.recording` 暴露：

- `getState()`
- `start()`
- `stop()`
- `listAudioDevices()`
- `onStateChanged(callback)`

渲染进程只通过这些方法控制录屏和展示状态，不接收媒体流。

## 设置页体验

新增录屏设置分区，使用紧凑的桌面应用控件：

- 清晰度预设分段控件。
- FPS 分段控件。
- 视频码率数字输入。
- 系统声音开关。
- 麦克风开关。
- 麦克风设备选择框。
- 音频模式选择框。
- 捕获鼠标开关。
- 录制时隐藏宠物开关。
- 保存目录名输入。
- 文件名模式输入。

当用户开启系统声音时，设置页不应把虚拟音频设备描述成正常步骤。如果运行时报告系统声音不可用，只在录制结果或状态区域显示简短排障提示。

## 宠物体验

录制开始时：

- 如果启用了 `hidePetWhenRecording`，隐藏宠物。
- 隐藏前显示短气泡：`开始录屏`。
- 保持托盘应用继续运行。
- 更新菜单状态，让录屏动作变为 `停止录屏`。

录制停止时：

- 如果宠物是录制服务隐藏的，恢复显示。
- 显示包含保存路径或简短成功信息的气泡。
- 如果音频有警告，在气泡中展示一条简短警告，并把详细诊断写入日志。

录制失败时：

- 如果宠物是录制服务隐藏的，恢复显示。
- 显示简短失败信息。
- 只有当 FFmpeg 产出了可播放文件时才保留部分文件，否则删除不完整输出文件。

## 错误处理

- 如果找不到 FFmpeg，提示：`录屏组件未找到，请重新安装应用。`
- 如果没有可用的视频捕获后端，提示：`屏幕录制启动失败，请检查系统权限或显卡驱动。`
- 如果系统声音 loopback 失败，在可行时继续录制视频和麦克风，并警告：`系统声音未录入。`
- 如果麦克风采集失败，在可行时继续录制视频和系统声音，并警告：`麦克风未录入。`
- 如果用户请求的两个音频源都失败，继续仅录视频，并警告：`音频未录入。`
- 如果无法创建输出路径，不启动 FFmpeg，并提示：`录屏保存目录不可用。`
- 如果录制已经开始，再次调用 `start` 时返回当前录制状态，不启动第二个录制进程。
- 如果空闲时调用 `stop`，返回空闲状态。

## 打包

随应用资源打包一个确定版本的 FFmpeg。该构建必须包含选定的 Windows 捕获后端、AAC 音频编码、H.264 视频编码，以及许可允许范围内的常见硬件编码器。

随应用资源打包 WASAPI loopback 辅助程序。只有在录制系统声音时才启动它。

应用需要在分发文档和关于/设置界面中包含 FFmpeg 以及辅助程序依赖的许可证说明。

## 测试

单元测试：

- 配置 schema 接受录屏默认值。
- 配置服务能把旧配置和录屏默认值合并。
- 录屏插件清单贡献菜单项、快捷键、设置分区和能力声明。
- 录屏服务能为纯视频录制生成 FFmpeg 参数。
- 录屏服务能为系统声音加麦克风的混合模式生成 FFmpeg 参数。
- 录屏服务能为独立音轨模式生成 FFmpeg 参数。
- 录屏服务拒绝重复开始录制。
- 录屏服务在空闲时停止会返回空闲状态。
- 录屏服务能报告可选音频源失败的警告。
- 核心 IPC 暴露录屏状态、开始、停止和音频设备列表。
- 预加载 API 暴露 `window.petdex.recording`。
- 应用动作分发能通过 `recording.toggle` 切换录制状态。

渲染测试：

- 宠物菜单渲染录屏动作，并显示正确标签。
- 设置页渲染录屏控件并保存录屏配置。
- 关闭麦克风录制时，设置页禁用麦克风设备选择。
- 当 `recording:state:changed` 触发时，录制状态会更新。

Windows 手动冒烟测试：

- 录制 1080p、30 FPS、开启系统声音、关闭麦克风。
- 录制 720p、30 FPS、系统声音和麦克风混合。
- 录制 720p、30 FPS、系统声音和麦克风分离音轨。
- 从宠物菜单停止录制。
- 确认保存的 MP4 能在 Windows 媒体播放器中播放，并且音频符合预期。
- 确认 Electron 内存不会随着录制时长持续增长。

## 非目标

- 第一版不支持 RTMP 或其它直播推流。
- 第一版不支持摄像头画中画。
- 第一版不支持 GIF 录制。
- 第一版不支持区域选择录制。
- 第一版不内置视频编辑器。
- 第一版不支持 macOS 或 Linux。

## 验收标准

- 用户可以从宠物菜单开始和停止录制。
- 第一版可以把主显示器录制成可播放的视频文件。
- Windows 上默认录入系统声音，不要求用户安装虚拟音频设备。
- 麦克风录制可以开启和关闭。
- 清晰度预设、FPS、码率、鼠标捕获、音频模式和保存命名设置可以持久化。
- 录制内容通过 FFmpeg 直接流式写入磁盘。
- Electron 渲染进程和主进程不会缓存视频帧或完整视频 Blob。
- 如果系统声音捕获失败，用户会收到清晰警告，应用在可行时仍继续录制视频。
- 现有截图、翻译、聊天、设置和宠物菜单行为继续正常工作。
- 聚焦的单元测试、渲染测试、类型检查和构建通过。
