import { EventEmitter } from "node:events";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createRecordingService, type RecordingChildProcessLike } from "../../src/main/services/recordingService";
import { defaultAppConfig, type AppConfig } from "../../src/shared/configSchema";

function createProcess() {
  const process = new EventEmitter() as RecordingChildProcessLike & EventEmitter;
  process.stdin = { write: vi.fn(), end: vi.fn() };
  process.kill = vi.fn();
  process.stdio = [];
  return process;
}

describe("recording service", () => {
  it("starts FFmpeg with an output path and recording state", async () => {
    const child = createProcess();
    const spawn = vi.fn(() => child);
    const mkdir = vi.fn();
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: mkdir,
      spawnProcess: spawn,
      now: () => new Date("2026-07-02T03:04:05Z"),
    });

    const result = await service.start({ ...defaultAppConfig.recording, recordSystemAudio: false, recordMicrophone: false });

    expect(mkdir).toHaveBeenCalledWith(join("C:/user-data", "recordings"), { recursive: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    const firstSpawnCall = spawn.mock.calls[0] as unknown as [string, string[]];
    expect(firstSpawnCall[0]).toBe("C:/app/ffmpeg.exe");
    expect(result.state.status).toBe("recording");
    expect(result.state.outputPath).toBe(join("C:/user-data", "recordings", "lacritomato-recording-20260702-030405.mp4"));
  });

  it("writes recordings to the selected custom directory", async () => {
    const child = createProcess();
    const spawn = vi.fn(() => child);
    const mkdir = vi.fn();
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: mkdir,
      spawnProcess: spawn,
      now: () => new Date("2026-07-02T03:04:05Z"),
    });

    const config = {
      ...defaultAppConfig.recording,
      saveDirectoryPath: "D:/captures/recordings",
      recordSystemAudio: false,
      recordMicrophone: false,
    } as AppConfig["recording"];
    const result = await service.start(config);

    expect(mkdir).toHaveBeenCalledWith(join("D:/captures/recordings"), { recursive: true });
    expect(result.state.outputPath).toBe(join("D:/captures/recordings", "lacritomato-recording-20260702-030405.mp4"));
  });

  it("returns the active state for duplicate starts", async () => {
    const child = createProcess();
    const spawn = vi.fn(() => child);
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      spawnProcess: spawn,
    });

    const first = await service.start({ ...defaultAppConfig.recording, recordSystemAudio: false });
    const second = await service.start(defaultAppConfig.recording);

    expect(second.state).toEqual(first.state);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("continues without system audio when the loopback helper is missing", async () => {
    const child = createProcess();
    const spawn = vi.fn(() => child);
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn((path: string) => path.endsWith("ffmpeg.exe")),
      mkdirSync: vi.fn(),
      spawnProcess: spawn,
    });

    const result = await service.start(defaultAppConfig.recording);
    const firstSpawnCall = spawn.mock.calls[0] as unknown as [string, string[]];
    const args = firstSpawnCall[1];

    expect(result.state.warnings).toEqual([{ code: "system-audio-unavailable", message: "系统声音未录入。" }]);
    expect(args).not.toContain("pipe:3");
  });

  it("starts the loopback helper with PCM settings and writes system audio to a sidecar file", async () => {
    const helper = createProcess();
    const helperStdout = { pipe: vi.fn() };
    helper.stdout = helperStdout;
    const ffmpeg = createProcess();
    const spawn = vi.fn((command: string) => (command.endsWith("wasapi.exe") ? helper : ffmpeg));
    const systemAudioStream = { end: vi.fn(), on: vi.fn() };
    const createWriteStream = vi.fn(() => systemAudioStream);
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      createWriteStream,
      spawnProcess: spawn,
      now: () => new Date("2026-07-02T03:04:05Z"),
    });

    await service.start({ ...defaultAppConfig.recording, recordSystemAudio: true, recordMicrophone: false });

    expect(spawn).toHaveBeenNthCalledWith(1, "C:/app/wasapi.exe", ["--format", "s16le", "--rate", "48000", "--channels", "2"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(createWriteStream).toHaveBeenCalledWith(join("C:/user-data", "recordings", "lacritomato-recording-20260702-030405.system.s16le"));
    expect(helperStdout.pipe).toHaveBeenCalledWith(systemAudioStream);
    const ffmpegSpawnCall = spawn.mock.calls[1] as unknown as [string, string[]];
    expect(ffmpegSpawnCall[1]).not.toContain("pipe:3");
    expect(ffmpegSpawnCall[1]).toContain(join("C:/user-data", "recordings", "lacritomato-recording-20260702-030405.video.mp4"));
  });

  it("removes temporary system audio and video sidecar files after merging", async () => {
    const helper = createProcess();
    const helperStdout = { pipe: vi.fn() };
    helper.stdout = helperStdout;
    const recorder = createProcess();
    const merger = createProcess();
    const spawn = vi.fn()
      .mockImplementationOnce(() => helper)
      .mockImplementationOnce(() => recorder)
      .mockImplementationOnce(() => {
        setTimeout(() => merger.emit("close", 0), 0);
        return merger;
      });
    const unlink = vi.fn();
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      createWriteStream: vi.fn(() => ({ end: vi.fn(), on: vi.fn() })),
      spawnProcess: spawn,
      unlinkSync: unlink,
      now: () => new Date("2026-07-02T03:04:05Z"),
    });

    await service.start({ ...defaultAppConfig.recording, recordSystemAudio: true, recordMicrophone: false });
    const stopPromise = service.stop();
    recorder.emit("close", 0);
    await stopPromise;

    expect(unlink).toHaveBeenCalledWith(join("C:/user-data", "recordings", "lacritomato-recording-20260702-030405.video.mp4"));
    expect(unlink).toHaveBeenCalledWith(join("C:/user-data", "recordings", "lacritomato-recording-20260702-030405.system.s16le"));
  });

  it("waits for the system audio sidecar stream to finish before merging", async () => {
    const helper = createProcess();
    const helperStdout = { pipe: vi.fn() };
    helper.stdout = helperStdout;
    const recorder = createProcess();
    const merger = createProcess();
    const spawn = vi.fn()
      .mockImplementationOnce(() => helper)
      .mockImplementationOnce(() => recorder)
      .mockImplementationOnce(() => {
        setTimeout(() => merger.emit("close", 0), 0);
        return merger;
      });
    const systemAudioStream = Object.assign(new EventEmitter(), { end: vi.fn() });
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      createWriteStream: vi.fn(() => systemAudioStream),
      spawnProcess: spawn,
      now: () => new Date("2026-07-02T03:04:05Z"),
    });

    await service.start({ ...defaultAppConfig.recording, recordSystemAudio: true, recordMicrophone: false });
    const stopPromise = service.stop();
    recorder.emit("close", 0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spawn).toHaveBeenCalledTimes(2);

    systemAudioStream.emit("finish");
    await stopPromise;

    expect(spawn).toHaveBeenCalledTimes(3);
  });

  it("attaches error handlers to the system audio sidecar stream", async () => {
    const helper = createProcess();
    const helperStdout = Object.assign(new EventEmitter(), { pipe: vi.fn() });
    helper.stdout = helperStdout as never;
    const ffmpeg = createProcess();
    const systemAudioStream = Object.assign(new EventEmitter(), { end: vi.fn() });
    const spawn = vi.fn((command: string) => (command.endsWith("wasapi.exe") ? helper : ffmpeg));
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      createWriteStream: vi.fn(() => systemAudioStream),
      spawnProcess: spawn,
    });

    await service.start({ ...defaultAppConfig.recording, recordSystemAudio: true, recordMicrophone: false });

    expect(helperStdout.listenerCount("error")).toBeGreaterThan(0);
    expect(systemAudioStream.listenerCount("error")).toBeGreaterThan(0);
  });

  it("returns idle when stopping while idle", async () => {
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      spawnProcess: vi.fn(() => createProcess()),
    });

    await expect(service.stop()).resolves.toEqual({
      state: { status: "idle", warnings: [] },
      warnings: [],
    });
  });

  it("writes q to FFmpeg stdin and returns the saved output path when stopped", async () => {
    const child = createProcess();
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      spawnProcess: vi.fn(() => child),
      now: () => new Date("2026-07-02T03:04:05Z"),
    });

    await service.start({ ...defaultAppConfig.recording, recordSystemAudio: false });
    const stopPromise = service.stop();
    child.emit("close", 0);
    const result = await stopPromise;

    expect(child.stdin?.write).toHaveBeenCalledWith("q");
    expect(child.stdin?.end).toHaveBeenCalled();
    expect(result.state.status).toBe("idle");
    expect(result.outputPath).toBe(join("C:/user-data", "recordings", "lacritomato-recording-20260702-030405.mp4"));
  });

  it("kills FFmpeg when graceful stop does not close before the timeout", async () => {
    const child = createProcess();
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      spawnProcess: vi.fn(() => child),
      now: () => new Date("2026-07-02T03:04:05Z"),
      stopTimeoutMs: 1,
    });

    await service.start({ ...defaultAppConfig.recording, recordSystemAudio: false });
    const result = await service.stop();

    expect(child.stdin?.write).toHaveBeenCalledWith("q");
    expect(child.stdin?.end).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(result.state.status).toBe("idle");
  });

  it("lists DirectShow microphone devices from FFmpeg stderr", async () => {
    const child = createProcess();
    const stderr = new EventEmitter();
    child.stderr = stderr as never;
    const service = createRecordingService({
      userDataPath: "C:/user-data",
      ffmpegPath: "C:/app/ffmpeg.exe",
      wasapiLoopbackHelperPath: "C:/app/wasapi.exe",
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      spawnProcess: vi.fn(() => child),
    });

    const devicesPromise = service.listAudioDevices();
    stderr.emit("data", Buffer.from("[dshow @ 1] DirectShow video devices\r\n[dshow @ 1]  \"Integrated Camera\"\r\n[dshow @ 1] DirectShow audio devices\r\n[dshow @ 1]  \"Microphone Array (Realtek(R) Audio)\"\r\n[dshow @ 1]     Alternative name \"@device_cm_{0}\\wave_{1}\"\r\n"));
    child.emit("close", 1);

    await expect(devicesPromise).resolves.toEqual([
      {
        id: "Microphone Array (Realtek(R) Audio)",
        name: "Microphone Array (Realtek(R) Audio)",
      },
    ]);
  });
});