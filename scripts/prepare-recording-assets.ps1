param(
  [string]$FfmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
  [switch]$SkipFfmpegDownload
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $repoRoot "assets\recording"
$helperProject = Join-Path $repoRoot "tools\recording\wasapi-loopback-helper\WasapiLoopbackHelper.csproj"
$tempDir = Join-Path $repoRoot ".tmp\recording-assets"
$helperPublishDir = Join-Path $tempDir "wasapi-loopback-helper"
$nugetConfig = Join-Path $repoRoot "NuGet.Config"
$env:APPDATA = Join-Path $repoRoot ".appdata"
$env:DOTNET_CLI_HOME = Join-Path $repoRoot ".dotnet-home"
$env:NUGET_PACKAGES = Join-Path $repoRoot ".nuget\packages"
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = "1"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"
$ffmpegZip = Join-Path $tempDir "ffmpeg.zip"
$ffmpegExe = Join-Path $assetDir "ffmpeg.exe"
$helperExe = Join-Path $assetDir "wasapi-loopback-helper.exe"

New-Item -ItemType Directory -Force -Path $assetDir, $tempDir | Out-Null

if (-not $SkipFfmpegDownload -and -not (Test-Path $ffmpegExe)) {
  Write-Host "下载 FFmpeg: $FfmpegUrl"
  Invoke-WebRequest -Uri $FfmpegUrl -OutFile $ffmpegZip
  $extractDir = Join-Path $tempDir "ffmpeg"
  if (Test-Path $extractDir) {
    Remove-Item -Recurse -Force $extractDir
  }
  Expand-Archive -Path $ffmpegZip -DestinationPath $extractDir -Force
  $downloadedFfmpeg = Get-ChildItem -Path $extractDir -Recurse -Filter ffmpeg.exe | Where-Object { $_.FullName -like "*\bin\ffmpeg.exe" } | Select-Object -First 1
  if ($null -eq $downloadedFfmpeg) {
    throw "FFmpeg 压缩包中没有找到 bin\ffmpeg.exe"
  }
  Copy-Item -LiteralPath $downloadedFfmpeg.FullName -Destination $ffmpegExe -Force
}

Write-Host "发布 WASAPI helper"
& dotnet publish $helperProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -p:EnableCompressionInSingleFile=true -o $helperPublishDir --configfile $nugetConfig
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$publishedHelper = Join-Path $helperPublishDir "wasapi-loopback-helper.exe"
if (-not (Test-Path $publishedHelper)) {
  throw "没有找到发布后的 wasapi-loopback-helper.exe"
}
for ($attempt = 1; $attempt -le 5; $attempt += 1) {
  try {
    Copy-Item -LiteralPath $publishedHelper -Destination $helperExe -Force
    break
  } catch {
    if ($attempt -eq 5) {
      throw
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host "录屏资源准备结果："
if (Test-Path $ffmpegExe) {
  Write-Host "- $ffmpegExe"
} else {
  Write-Warning "FFmpeg 尚未准备：请重新运行脚本且不要传 -SkipFfmpegDownload，或手动放置 assets\recording\ffmpeg.exe。"
}
Write-Host "- $helperExe"