import { describe, expect, it } from "vitest";
import { buildRecordingFfmpegArgs, createRecordingFilename, getRecordingScaleFilter } from "../../src/main/services/recordingFfmpeg";
import { defaultAppConfig } from "../../src/shared/configSchema";

const baseConfig = defaultAppConfig.recording;

describe("recording FFmpeg argument builder", () => {
  it("builds video-only recording arguments", () => {
    const args = buildRecordingFfmpegArgs({
      config: { ...baseConfig, recordSystemAudio: false, recordMicrophone: false },
      outputPath: "C:/tmp/recording.mp4",
      captureBackend: "ddagrab",
      videoEncoder: "libx264",
    });

    expect(args).toEqual([
      "-y",
      "-f", "lavfi",
      "-i", "ddagrab=framerate=30:draw_mouse=1",
      "-map", "0:v",
      "-vf", "hwdownload,format=bgra,scale=-2:1080",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", "8000k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "C:/tmp/recording.mp4",
    ]);
  });

  it("builds gdigrab input arguments for the compatibility backend", () => {
    const args = buildRecordingFfmpegArgs({
      config: { ...baseConfig, recordSystemAudio: false, recordMicrophone: false, qualityPreset: "original" },
      outputPath: "C:/tmp/gdigrab.mp4",
      captureBackend: "gdigrab",
    });

    expect(args).toContain("gdigrab");
    expect(args).toContain("desktop");
    expect(args).not.toContain("hwdownload,format=bgra");
  });
  it("builds mixed system audio and microphone arguments", () => {
    const args = buildRecordingFfmpegArgs({
      config: { ...baseConfig, recordSystemAudio: true, recordMicrophone: true, microphoneDeviceName: "Microphone", audioMode: "mixed" },
      outputPath: "C:/tmp/with-audio.mp4",
      captureBackend: "gdigrab",
      videoEncoder: "h264_mf",
      includeSystemAudio: true,
      includeMicrophone: true,
      systemAudioPipeIndex: 3,
    });

    expect(args).toContain("pipe:3");
    expect(args).toContain("audio=Microphone");
    expect(args.join(";")).toContain("[sys][mic]amix=inputs=2:duration=longest[aout]");
    expect(args).toContain("[aout]");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
  });

  it("builds separate audio track arguments", () => {
    const args = buildRecordingFfmpegArgs({
      config: { ...baseConfig, recordSystemAudio: true, recordMicrophone: true, microphoneDeviceName: "USB Mic", audioMode: "separate" },
      outputPath: "C:/tmp/separate.mp4",
      includeSystemAudio: true,
      includeMicrophone: true,
      systemAudioPipeIndex: 3,
    });

    expect(args).toContain("-map");
    expect(args).toContain("1:a");
    expect(args).toContain("2:a");
    expect(args).toContain("handler_name=System Audio");
    expect(args).toContain("handler_name=Microphone");
  });

  it("returns scale filters for quality presets", () => {
    expect(getRecordingScaleFilter("original")).toBeUndefined();
    expect(getRecordingScaleFilter("1080p")).toBe("scale=-2:1080");
    expect(getRecordingScaleFilter("720p")).toBe("scale=-2:720");
    expect(getRecordingScaleFilter("480p")).toBe("scale=-2:480");
  });

  it("creates timestamped recording filenames", () => {
    expect(createRecordingFilename("lacritomato-recording-yyyyMMdd-HHmmss", new Date("2026-07-02T03:04:05Z"))).toBe("lacritomato-recording-20260702-030405.mp4");
  });
});