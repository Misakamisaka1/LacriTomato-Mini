export type RecordingQualityPreset = "original" | "1080p" | "720p" | "480p";
export type RecordingFrameRate = 15 | 30 | 60;
export type RecordingAudioMode = "mixed" | "separate";
export type RecordingStatus = "idle" | "recording" | "stopping";

export interface RecordingWarning {
  code: "system-audio-unavailable" | "microphone-unavailable" | "audio-unavailable";
  message: string;
}

export interface RecordingState {
  status: RecordingStatus;
  startedAt?: string;
  outputPath?: string;
  warnings: RecordingWarning[];
}

export interface RecordingStartResult {
  state: RecordingState;
}

export interface RecordingStopResult {
  state: RecordingState;
  outputPath?: string;
  warnings: RecordingWarning[];
}

export interface RecordingAudioDevice {
  id: string;
  name: string;
  default?: boolean;
}