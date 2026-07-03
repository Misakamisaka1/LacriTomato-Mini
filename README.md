# LacriTomato Mini Petdex

Windows 优先的 Electron 桌面宠物平台。

## 当前功能

- 透明 LacriTomato Mini 桌面宠物窗口，支持拖动。
- 右键唤起横向宠物头像功能菜单。
- 翻译插件：支持 OpenAI 兼容的 DeepSeek 模型配置、API Key 保存、多语言输出。
- 快速翻译选中文本：复制当前选区、打开翻译面板并自动开始翻译。
- 截图插件：区域截图、复制、保存、OCR 结果面板和贴图窗口流程。
- 录屏插件：基于 FFmpeg 侧车进程录制屏幕，支持系统声音、麦克风、清晰度、FPS、码率、混音/分轨和录制时隐藏宠物。
- 宠物聊天插件：使用已保存模型配置的独立聊天窗口。
- 设置窗口：模型、快捷键、OCR、截图、录屏、宠物行为和插件启用状态。
- 自定义快捷键捕获 UI，支持 2-3 键组合。
- 保存设置后，运行时快捷键会重新注册，插件菜单会刷新。

## 录屏运行时资源

首次使用录屏前，需要准备 FFmpeg 和 WASAPI loopback helper：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1
```

脚本会：

- 下载 Windows FFmpeg GPL 构建到 `assets/recording/ffmpeg.exe`。
- 发布项目内的 WASAPI helper 到 `assets/recording/wasapi-loopback-helper.exe`。
- helper 将系统声音以 `s16le / 48000Hz / 2ch` PCM 流写给 FFmpeg，应用进程不缓存媒体数据。

如果你已经手动放好了 `ffmpeg.exe`，可以只重新发布 helper：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1 -SkipFfmpegDownload
```

注意：默认 FFmpeg 构建包含 `libx264`，闭源商业分发前需要重新评估 FFmpeg 构建和许可证。

## 后续路线

- 模型 OCR：当前截图覆盖层已支持本地 OCR，模型 OCR 预留给后续实现。
- 安装包冒烟 QA：NSIS 安装包可以构建，但安装、卸载、开机自启和升级行为仍需发布前产品级验证。

## 常用命令

- `npm install`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm start`
- `npm run dist`

## 默认快捷键

- 截图：`Ctrl+Shift+A`
- 打开翻译：`Ctrl+Shift+T`
- 快速翻译选区：`Ctrl+Shift+Y`
- 显示/隐藏宠物：`Ctrl+Shift+P`
- 开始/停止录屏：`Ctrl+Shift+R`