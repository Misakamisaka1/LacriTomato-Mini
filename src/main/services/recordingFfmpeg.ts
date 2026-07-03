import type { AppConfig } from "../../shared/configSchema.js";
import type { RecordingQualityPreset } from "../../plugins/recording/types.js";

export type RecordingCaptureBackend = "ddagrab" | "gdigrab";

export interface BuildRecordingFfmpegArgsOptions {
  config: AppConfig["recording"];
  outputPath: string;
  captureBackend?: RecordingCaptureBackend;
  videoEncoder?: string;
  includeSystemAudio?: boolean;
  includeMicrophone?: boolean;
  systemAudioPipeIndex?: number;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function createRecordingFilename(pattern: string, date = new Date()) {
  const timestamped = pattern
    .replace(/yyyy/g, String(date.getUTCFullYear()))
    .replace(/MM/g, pad2(date.getUTCMonth() + 1))
    .replace(/dd/g, pad2(date.getUTCDate()))
    .replace(/HH/g, pad2(date.getUTCHours()))
    .replace(/mm/g, pad2(date.getUTCMinutes()))
    .replace(/ss/g, pad2(date.getUTCSeconds()));

  return timestamped.toLowerCase().endsWith(".mp4") ? timestamped : `${timestamped}.mp4`;
}

export function getRecordingScaleFilter(preset: RecordingQualityPreset) {
  if (preset === "original") {
    return undefined;
  }

  const height = preset === "1080p" ? 1080 : preset === "720p" ? 720 : 480;
  return `scale=-2:${height}`;
}

function createVideoInputArgs(config: AppConfig["recording"], captureBackend: RecordingCaptureBackend) {
  if (captureBackend === "ddagrab") {
    return [
      "-f", "lavfi",
      "-i", `ddagrab=framerate=${config.frameRate}:draw_mouse=${config.captureCursor ? "1" : "0"}`,
    ];
  }

  return [
    "-f", "gdigrab",
    "-framerate", String(config.frameRate),
    "-draw_mouse", config.captureCursor ? "1" : "0",
    "-i", "desktop",
  ];
}

function createAudioInputArgs(options: Required<Pick<BuildRecordingFfmpegArgsOptions, "systemAudioPipeIndex">> & BuildRecordingFfmpegArgsOptions) {
  const args: string[] = [];
  const inputIndexes: { system?: number; microphone?: number } = {};
  let nextInputIndex = 1;

  if (options.includeSystemAudio) {
    args.push("-f", "s16le", "-ar", "48000", "-ac", "2", "-i", `pipe:${options.systemAudioPipeIndex}`);
    inputIndexes.system = nextInputIndex;
    nextInputIndex += 1;
  }

  if (options.includeMicrophone) {
    const deviceName = options.config.microphoneDeviceName.trim() || "default";
    args.push("-f", "dshow", "-i", `audio=${deviceName}`);
    inputIndexes.microphone = nextInputIndex;
  }

  return { args, inputIndexes };
}

function createAudioOutputArgs(config: AppConfig["recording"], inputIndexes: { system?: number; microphone?: number }) {
  const hasSystem = inputIndexes.system !== undefined;
  const hasMicrophone = inputIndexes.microphone !== undefined;

  if (!hasSystem && !hasMicrophone) {
    return [];
  }

  if (hasSystem && hasMicrophone && config.audioMode === "mixed") {
    return [
      "-filter_complex",
      `[${inputIndexes.system}:a]aresample=48000[sys];[${inputIndexes.microphone}:a]aresample=48000[mic];[sys][mic]amix=inputs=2:duration=longest[aout]`,
      "-map", "0:v",
      "-map", "[aout]",
      "-c:a", "aac",
      "-b:a", "192k",
    ];
  }

  const args = ["-map", "0:v"];
  let outputAudioIndex = 0;

  if (hasSystem) {
    args.push("-map", `${inputIndexes.system}:a`, `-metadata:s:a:${outputAudioIndex}`, "handler_name=System Audio");
    outputAudioIndex += 1;
  }

  if (hasMicrophone) {
    args.push("-map", `${inputIndexes.microphone}:a`, `-metadata:s:a:${outputAudioIndex}`, "handler_name=Microphone");
  }

  args.push("-c:a", "aac", "-b:a", "192k");
  return args;
}

function createVideoFilter(captureBackend: RecordingCaptureBackend, scaleFilter: string | undefined) {
  if (captureBackend === "ddagrab") {
    return ["hwdownload", "format=bgra", scaleFilter].filter(Boolean).join(",");
  }

  return scaleFilter;
}

export function buildRecordingFfmpegArgs(options: BuildRecordingFfmpegArgsOptions) {
  const captureBackend = options.captureBackend ?? "ddagrab";
  const videoEncoder = options.videoEncoder ?? "libx264";
  const includeSystemAudio = options.includeSystemAudio ?? options.config.recordSystemAudio;
  const includeMicrophone = options.includeMicrophone ?? options.config.recordMicrophone;
  const systemAudioPipeIndex = options.systemAudioPipeIndex ?? 3;
  const audioInputs = createAudioInputArgs({
    ...options,
    includeSystemAudio,
    includeMicrophone,
    systemAudioPipeIndex,
  });
  const scaleFilter = getRecordingScaleFilter(options.config.qualityPreset);
  const videoFilter = createVideoFilter(captureBackend, scaleFilter);
  const args = [
    "-y",
    ...createVideoInputArgs(options.config, captureBackend),
    ...audioInputs.args,
  ];

  const audioOutputArgs = createAudioOutputArgs(options.config, audioInputs.inputIndexes);
  if (audioOutputArgs.length > 0) {
    args.push(...audioOutputArgs);
  } else {
    args.push("-map", "0:v");
  }

  if (videoFilter) {
    args.push("-vf", videoFilter);
  }

  args.push(
    "-c:v", videoEncoder,
    "-preset", "veryfast",
    "-b:v", `${options.config.videoBitrateKbps}k`,
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    options.outputPath,
  );

  return args;
}