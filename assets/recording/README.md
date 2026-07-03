# 录屏运行时资源

这里放录屏功能运行时需要的可执行文件：

- `ffmpeg.exe`：负责屏幕采集、编码、麦克风采集、音频混流和 MP4 落盘。
- `wasapi-loopback-helper.exe`：负责捕获 Windows 默认播放设备的系统声音，并以 `s16le / 48000Hz / 2ch` PCM 流写给 FFmpeg。

## 准备方式

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1
```

脚本会下载 Windows FFmpeg GPL 构建，并发布项目内的 WASAPI helper。helper 使用 NAudio 捕获 WASAPI loopback，发布为压缩 self-contained 单文件。生成后的文件会被应用通过 `assets/recording/ffmpeg.exe` 和 `assets/recording/wasapi-loopback-helper.exe` 使用。

如果你已经手动准备好了 `ffmpeg.exe`，可以跳过下载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-recording-assets.ps1 -SkipFfmpegDownload
```

## 注意

默认下载的 FFmpeg GPL 构建包含 `libx264`。如果后续要做闭源商业分发，需要重新评估 FFmpeg 构建和编码器选择。