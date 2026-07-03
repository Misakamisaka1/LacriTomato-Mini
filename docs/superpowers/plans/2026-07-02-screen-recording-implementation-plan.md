# 屏幕录制功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 新增一个 Windows 优先的录屏插件，支持通过 FFmpeg 侧车进程录制屏幕，并为系统声音、麦克风、清晰度、FPS、码率和保存设置打通应用侧链路。

**Architecture:** Electron 主进程只负责配置、状态、进程编排和 IPC；FFmpeg 负责视频编码、音频混流和落盘；WASAPI loopback 作为独立辅助进程接口接入，辅助程序缺失时降级为视频/麦克风录制并给出警告。渲染进程只显示状态和设置，不接收媒体数据。

**Tech Stack:** Electron 36、TypeScript、React 19、Vitest、FFmpeg、Windows WASAPI loopback helper。

---

## 文件结构

- 新增 `src/plugins/recording/types.ts`：录屏状态、设备、结果、FFmpeg 参数构建类型。
- 新增 `src/plugins/recording/manifest.ts`：录屏插件菜单、快捷键、设置分区和能力声明。
- 新增 `src/main/services/recordingFfmpeg.ts`：纯函数，生成文件名、分辨率、FFmpeg 参数和音频映射。
- 新增 `src/main/services/recordingService.ts`：主进程服务，负责启动/停止 FFmpeg 和 WASAPI helper。
- 修改 `src/shared/configSchema.ts`：新增 `recording` 配置和 `toggleRecording` 快捷键。
- 修改 `src/shared/pluginTypes.ts`：新增录屏和音频能力声明。
- 修改 `src/shared/ipcChannels.ts`：新增录屏 IPC 通道。
- 修改 `src/preload/api.ts`、`src/preload/index.ts`：暴露 `window.petdex.recording`。
- 修改 `src/main/appPaths.ts`：新增 FFmpeg 和 WASAPI helper 资源路径。
- 修改 `src/main/ipc/registerCoreIpc.ts`：注册录屏 IPC。
- 修改 `src/main/app.ts`：注册录屏插件，接入菜单动作、快捷键、气泡和宠物隐藏/恢复。
- 修改 `src/renderer/components/PetHeadMenu.tsx`：加入录屏图标。
- 修改 `src/renderer/shell/SettingsApp.tsx`：新增录屏设置页。
- 修改相关测试：配置、插件注册、路径、录屏参数、录屏服务、IPC、预加载、设置页、菜单。

## 任务 1：配置、插件清单和资源路径

**Files:**
- Modify: `src/shared/configSchema.ts`
- Modify: `src/shared/pluginTypes.ts`
- Modify: `src/main/appPaths.ts`
- Create: `src/plugins/recording/types.ts`
- Create: `src/plugins/recording/manifest.ts`
- Test: `tests/unit/configSchema.test.ts`
- Test: `tests/unit/configService.test.ts`
- Test: `tests/unit/pluginRegistry.test.ts`
- Test: `tests/unit/appPaths.test.ts`

- [x] 写失败测试：默认配置包含 `recording`、`toggleRecording`、`plugins.recording`。
- [x] 写失败测试：旧配置经 config service 合并后补齐 `recording`。
- [x] 写失败测试：插件 registry 收集录屏菜单、快捷键、设置分区、能力。
- [x] 写失败测试：app paths 返回 `ffmpegPath` 和 `wasapiLoopbackHelperPath`。
- [x] 实现 schema、默认值、插件能力、manifest 和路径字段。
- [x] 运行相关单元测试确认通过。

## 任务 2：FFmpeg 参数构建纯函数

**Files:**
- Create: `src/main/services/recordingFfmpeg.ts`
- Test: `tests/unit/recordingFfmpeg.test.ts`

- [x] 写失败测试：纯视频录制生成显示器捕获、帧率、码率、缩放、鼠标和 MP4 输出参数。
- [x] 写失败测试：系统声音加麦克风混合模式生成 `amix` filter graph。
- [x] 写失败测试：独立音轨模式生成两条 AAC 音轨映射。
- [x] 写失败测试：清晰度预设能计算 1080p、720p、480p 或原始尺寸。
- [x] 实现参数构建，保持为无副作用纯函数。
- [x] 运行相关单元测试确认通过。

## 任务 3：录屏服务进程编排

**Files:**
- Create: `src/main/services/recordingService.ts`
- Test: `tests/unit/recordingService.test.ts`

- [x] 写失败测试：空闲状态下 `start` 会创建输出路径并调用注入的 spawn。
- [x] 写失败测试：重复 `start` 返回当前录制状态，不启动第二个进程。
- [x] 写失败测试：空闲时 `stop` 返回 idle。
- [x] 写失败测试：启用系统声音但 helper 不存在时继续录制并返回 `系统声音未录入。` 警告。
- [x] 写失败测试：`stop` 优先向 FFmpeg stdin 写入 `q`，并在 close 后返回保存路径。
- [x] 实现服务、状态订阅、可注入 spawn、可注入文件系统探测和 helper 管道。
- [x] 运行相关单元测试确认通过。

## 任务 4：IPC、预加载 API 和主进程接入

**Files:**
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/registerCoreIpc.ts`
- Modify: `src/main/app.ts`
- Test: `tests/unit/registerCoreIpc.recording.test.ts`
- Test: `tests/unit/preloadApi.test.ts` if existing pattern is available; otherwise cover through typecheck.

- [x] 写失败测试：IPC 暴露录屏状态、开始、停止、音频设备列表。
- [x] 写失败测试：`recording.toggle` 在空闲时开始录制，在录制中停止录制。
- [x] 实现 IPC 通道和 preload API。
- [x] 在 app 中创建 recordingService、注册 manifest、注册快捷键动作和菜单动作。
- [x] 运行相关单元测试和类型检查。

## 任务 5：设置页和菜单 UI

**Files:**
- Modify: `src/renderer/components/PetHeadMenu.tsx`
- Modify: `src/renderer/shell/SettingsApp.tsx`
- Modify: `src/renderer/shell/SettingsApp.css`
- Test: `tests/renderer/PetHeadMenu.test.tsx`
- Test: `tests/renderer/SettingsApp.test.tsx`

- [x] 写失败测试：宠物菜单可以渲染录屏动作。
- [x] 写失败测试：设置页显示录屏分区，并能保存清晰度、FPS、码率、系统声音、麦克风、音频模式等字段。
- [x] 写失败测试：关闭麦克风时禁用麦克风设备选择。
- [x] 实现录屏图标映射和设置表单。
- [x] 运行相关渲染测试。

## 任务 6：整体验证

**Files:**
- Modify as needed: `README.md`

- [x] 运行 `npm test`。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm run build`。
- [x] 如果没有打包 FFmpeg/helper，确认运行时错误提示为 `录屏组件未找到，请重新安装应用。`。
- [x] 总结已完成能力和仍需补充的 FFmpeg/helper 打包事项。

## 自检

- 规格中的配置、插件、IPC、设置页、菜单、服务和测试都有对应任务。
- 第一版不会在 Electron 内存中缓存媒体数据。
- 系统声音主路径是 WASAPI loopback helper；虚拟音频设备只作为已有设备兜底。
- 当前计划把原生 helper 编译和 FFmpeg 二进制下载作为打包资源问题，不把网络下载混入代码实现。
