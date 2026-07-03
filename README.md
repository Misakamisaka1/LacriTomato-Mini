# LacriTomato Mini Petdex

Windows 优先的 Electron 桌面宠物平台。项目把 LacriTomato Mini 桌面宠物、翻译、截图/OCR、录屏和宠物聊天放在一个轻量插件壳里，适合个人桌面效率和陪伴场景。

## 功能概览

- 桌面宠物：透明置顶宠物窗口，支持拖动、显示/隐藏、透明度、尺寸、动画速度和游走开关。
- 宠物菜单：右键唤起横向头像菜单，插件启用状态变化后会自动刷新。
- 翻译插件：支持 OpenAI 兼容接口，默认面向 DeepSeek 配置；可保存 API Key、设置源语言/目标语言并保留翻译历史。
- 快速翻译：复制当前选中文本，打开翻译面板并自动开始翻译。
- 截图插件：区域截图、窗口目标辅助、复制、保存、贴图、标注和 OCR 结果覆盖层。
- 本地 OCR：内置 `chi_sim.traineddata` 与 `eng.traineddata`，默认使用本地识别；模型 OCR 仍是后续预留能力。
- 录屏插件：基于 FFmpeg 侧车进程录制屏幕，支持系统声音、麦克风、清晰度、FPS、码率、混音/分轨和录制时隐藏宠物。
- 宠物聊天：使用已保存模型配置的独立聊天窗口，支持历史、长期记忆、人格模板和主动话题。
- 设置窗口：统一管理模型、快捷键、OCR、截图、录屏、宠物行为、聊天和插件开关。
- 快捷键系统：支持 2-3 键组合；保存设置后运行时快捷键会重新注册。

## 技术栈

- Electron 36
- React 19
- Vite 6
- TypeScript 5.8
- Vitest + Testing Library
- Tesseract.js
- electron-builder

## 快速开始

```powershell
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1
npm run typecheck
npm test
npm start
```

说明：

- `npm start` 会先构建 renderer、preload 和 main，再启动 Electron。
- 只调试渲染层时可以运行 `npm run dev` 启动 Vite。
- 如果暂时不用录屏，可以先跳过录屏资源准备；截图、翻译、聊天等功能不依赖 FFmpeg。

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

## 模型与数据

- 默认模型服务地址：`https://api.deepseek.com`
- 默认模型名：`deepseek-v4-flash`
- API Key 会通过应用的 secret 服务保存，不写入仓库。
- 截图默认保存到用户数据目录下的 `screenshots`。
- 录屏默认保存到用户数据目录下的 `recordings`。
- 聊天历史和长期记忆保存在用户数据目录中，受设置页的历史条数和记忆开关控制。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm install` | 安装 Node 依赖 |
| `npm run dev` | 启动 Vite 渲染层开发服务器 |
| `npm run typecheck` | 检查 renderer 与 main TypeScript 类型 |
| `npm test` | 运行 Vitest 测试 |
| `npm run build` | 构建 renderer、preload 和 main |
| `npm start` | 构建后启动 Electron |
| `npm run dist` | 构建 Windows NSIS 安装包 |

## 默认快捷键

| 功能 | 快捷键 |
| --- | --- |
| 截图 | `Ctrl+Shift+A` |
| 打开翻译 | `Ctrl+Shift+T` |
| 快速翻译选区 | `Ctrl+Shift+Y` |
| 显示/隐藏宠物 | `Ctrl+Shift+P` |
| 开始/停止录屏 | `Ctrl+Shift+R` |

## 项目结构

```text
assets/                 宠物素材、OCR 数据和录屏运行时资源说明
docs/                   设计文档和实施计划
scripts/                录屏资源准备脚本
src/main/               Electron 主进程、窗口创建和系统服务
src/plugins/            翻译、截图、聊天、录屏插件
src/preload/            安全暴露给渲染进程的 API
src/renderer/           宠物壳、设置页和共享 UI
src/shared/             配置 schema、IPC channel、插件类型和共享逻辑
tests/                  单元测试与渲染层测试
tools/recording/        WASAPI loopback helper 源码
```

## 打包与发布备注

- `release/`、`dist/`、`node_modules/`、`.tmp/`、`.nuget/` 和录屏 `.exe` 产物不会提交到 Git。
- `assets/recording/README.md` 说明了录屏运行时文件的准备方式。
- NSIS 安装包可以通过 `npm run dist` 生成；发布前仍建议做安装、卸载、升级、开机自启和快捷键占用的人工冒烟检查。

## 后续路线

- 模型 OCR：截图覆盖层已支持本地 OCR，模型 OCR 预留给后续实现。
- 录屏 QA：继续验证更多 Windows 设备上的系统声音、麦克风和分轨输出。
- 安装包 QA：补齐安装、卸载、开机自启和升级行为的发布前检查。
