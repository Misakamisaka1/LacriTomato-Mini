import {
  createWriteStream as nodeCreateWriteStream,
  existsSync as nodeExistsSync,
  mkdirSync as nodeMkdirSync,
  unlinkSync as nodeUnlinkSync,
} from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import type { AppConfig } from "../../shared/configSchema.js";
import type {
  RecordingAudioDevice,
  RecordingStartResult,
  RecordingState,
  RecordingStopResult,
  RecordingWarning,
} from "../../plugins/recording/types.js";
import { buildRecordingFfmpegArgs, createRecordingFilename } from "./recordingFfmpeg.js";

export interface RecordingWritableStreamLike {
  end?(): unknown;
  on?(event: "error", listener: () => void): unknown;
  once?(event: "finish" | "close" | "error", listener: () => void): unknown;
}

export interface RecordingChildProcessLike {
  stdin?: { write(chunk: string): unknown; end?(): unknown };
  stdout?: { pipe(destination: unknown): unknown; unpipe?(destination?: unknown): unknown; on?(event: "error", listener: () => void): unknown };
  stderr?: { on(event: "data", listener: (chunk: unknown) => void): unknown };
  stdio?: unknown[];
  once(event: "close" | "exit" | "error", listener: (...args: unknown[]) => void): unknown;
  kill?(signal?: string): unknown;
}

export type RecordingSpawnProcess = (command: string, args: string[], options?: { stdio?: unknown[] }) => RecordingChildProcessLike;

export interface RecordingServiceOptions {
  userDataPath: string;
  ffmpegPath: string;
  wasapiLoopbackHelperPath: string;
  existsSync?: (path: string) => boolean;
  mkdirSync?: (path: string, options: { recursive: boolean }) => unknown;
  unlinkSync?: (path: string) => unknown;
  createWriteStream?: (path: string) => RecordingWritableStreamLike;
  spawnProcess?: RecordingSpawnProcess;
  now?: () => Date;
  stopTimeoutMs?: number;
}

export interface RecordingService {
  getState(): RecordingState;
  start(config: AppConfig["recording"]): Promise<RecordingStartResult>;
  stop(): Promise<RecordingStopResult>;
  listAudioDevices(): Promise<RecordingAudioDevice[]>;
  onStateChanged(callback: (state: RecordingState) => void): () => void;
}

interface ActiveRecording {
  config: AppConfig["recording"];
  process: RecordingChildProcessLike;
  helper?: RecordingChildProcessLike;
  systemAudioStream?: RecordingWritableStreamLike;
  outputPath: string;
  videoOutputPath: string;
  systemAudioPath?: string;
  systemAudioFinished?: Promise<void>;
  warnings: RecordingWarning[];
  closed: Promise<void>;
}

const systemAudioUnavailableWarning: RecordingWarning = {
  code: "system-audio-unavailable",
  message: "系统声音未录入。",
};

const idleState: RecordingState = { status: "idle", warnings: [] };
const loopbackHelperArgs = ["--format", "s16le", "--rate", "48000", "--channels", "2"];
const defaultStopTimeoutMs = 5000;

function createClosedPromise(process: RecordingChildProcessLike) {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    process.once("close", finish);
    process.once("exit", finish);
    process.once("error", finish);
  });
}

function spawnNodeProcess(command: string, args: string[], options?: { stdio?: unknown[] }) {
  return spawn(command, args, options as never) as unknown as RecordingChildProcessLike;
}
function createStreamFinishedPromise(stream: RecordingWritableStreamLike) {
  if (!stream.once) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve();
    };

    stream.once?.("finish", finish);
    stream.once?.("close", finish);
    stream.once?.("error", finish);
  });
}

function requestGracefulStop(process: RecordingChildProcessLike) {
  try {
    process.stdin?.write("q");
    process.stdin?.end?.();
  } catch {
    process.kill?.("SIGTERM");
  }
}

function waitForCloseOrKill(recording: ActiveRecording, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let resolved = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve();
    };

    timeout = setTimeout(() => {
      recording.process.kill?.("SIGTERM");
      recording.helper?.kill?.();
      finish();
    }, timeoutMs);

    recording.closed.then(finish, finish);
  });
}

function attachIgnoredStreamErrorHandler(stream: unknown) {
  const maybeStream = stream as { on?: (event: "error", listener: () => void) => unknown } | undefined;
  maybeStream?.on?.("error", () => undefined);
}

function appendProcessChunk(current: string, chunk: unknown) {
  if (Buffer.isBuffer(chunk)) {
    return current + chunk.toString("utf8");
  }

  return current + String(chunk);
}

function parseDirectShowAudioDevices(output: string): RecordingAudioDevice[] {
  const devices: RecordingAudioDevice[] = [];
  let inAudioSection = false;

  for (const line of output.split(/\r?\n/)) {
    const text = line.replace(/^\[[^\]]+\]\s*/, "").trim();

    if (/DirectShow audio devices/i.test(text)) {
      inAudioSection = true;
      continue;
    }

    if (/DirectShow video devices/i.test(text)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection || /Alternative name/i.test(text)) {
      continue;
    }

    const match = text.match(/^"(.+)"$/);
    const name = match?.[1]?.trim();
    if (name && !devices.some((device) => device.name === name)) {
      devices.push({ id: name, name });
    }
  }

  return devices;
}

function createSidecarPath(outputPath: string, suffix: string) {
  return outputPath.toLowerCase().endsWith(".mp4") ? `${outputPath.slice(0, -4)}${suffix}` : `${outputPath}${suffix}`;
}

function resolveSaveDirectory(userDataPath: string, config: AppConfig["recording"]) {
  const customDirectory = config.saveDirectoryPath.trim();
  if (customDirectory && isAbsolute(customDirectory)) {
    return normalize(customDirectory);
  }

  return join(userDataPath, config.saveDirectoryName || "recordings");
}

function cleanupSidecarFile(path: string, unlinkSync: (path: string) => unknown) {
  try {
    unlinkSync(path);
  } catch {
    // Temporary sidecar cleanup should not hide a successful final recording.
  }
}

function buildSystemAudioMergeArgs(config: AppConfig["recording"], videoInputPath: string, systemAudioPath: string, outputPath: string) {
  const args = [
    "-y",
    "-i", videoInputPath,
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "-i", systemAudioPath,
  ];

  if (config.recordMicrophone && config.audioMode === "mixed") {
    args.push(
      "-filter_complex",
      "[1:a]aresample=48000[sys];[0:a]aresample=48000[mic];[sys][mic]amix=inputs=2:duration=shortest[aout]",
      "-map", "0:v",
      "-map", "[aout]",
    );
  } else {
    args.push("-map", "0:v", "-map", "1:a");
    if (config.recordMicrophone && config.audioMode === "separate") {
      args.push("-map", "0:a", "-metadata:s:a:0", "handler_name=System Audio", "-metadata:s:a:1", "handler_name=Microphone");
    }
  }

  args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outputPath);
  return args;
}

export function createRecordingService(options: RecordingServiceOptions): RecordingService {
  const existsSync = options.existsSync ?? nodeExistsSync;
  const mkdirSync = options.mkdirSync ?? nodeMkdirSync;
  const unlinkSync = options.unlinkSync ?? nodeUnlinkSync;
  const createWriteStream = options.createWriteStream ?? ((path: string) => nodeCreateWriteStream(path));
  const spawnProcess = options.spawnProcess ?? spawnNodeProcess;
  const now = options.now ?? (() => new Date());
  const stopTimeoutMs = options.stopTimeoutMs ?? defaultStopTimeoutMs;
  const listeners = new Set<(state: RecordingState) => void>();
  let state: RecordingState = idleState;
  let active: ActiveRecording | undefined;

  function setState(nextState: RecordingState) {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
  }

  async function runMergeProcess(args: string[]) {
    const process = spawnProcess(options.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    await createClosedPromise(process);
  }

  return {
    getState() {
      return state;
    },
    async start(config) {
      if (active && state.status === "recording") {
        return { state };
      }

      if (!existsSync(options.ffmpegPath)) {
        throw new Error("录屏组件未找到，请重新安装应用。");
      }

      const outputDirectory = resolveSaveDirectory(options.userDataPath, config);
      mkdirSync(outputDirectory, { recursive: true });
      const outputPath = join(outputDirectory, createRecordingFilename(config.filenamePattern || "lacritomato-recording-yyyyMMdd-HHmmss", now()));
      const warnings: RecordingWarning[] = [];
      let includeSystemAudio = config.recordSystemAudio;
      let helper: RecordingChildProcessLike | undefined;
      let systemAudioStream: RecordingWritableStreamLike | undefined;
      let systemAudioPath: string | undefined;
      let systemAudioFinished: Promise<void> | undefined;
      const videoOutputPath = includeSystemAudio ? createSidecarPath(outputPath, ".video.mp4") : outputPath;

      if (config.recordSystemAudio) {
        if (existsSync(options.wasapiLoopbackHelperPath)) {
          systemAudioPath = createSidecarPath(outputPath, ".system.s16le");
          systemAudioStream = createWriteStream(systemAudioPath);
          systemAudioFinished = createStreamFinishedPromise(systemAudioStream);
          attachIgnoredStreamErrorHandler(systemAudioStream);
          helper = spawnProcess(options.wasapiLoopbackHelperPath, loopbackHelperArgs, { stdio: ["ignore", "pipe", "pipe"] });
          if (helper.stdout) {
            attachIgnoredStreamErrorHandler(helper.stdout);
            helper.stdout.pipe(systemAudioStream);
          }
        } else {
          includeSystemAudio = false;
          warnings.push(systemAudioUnavailableWarning);
        }
      }

      const args = buildRecordingFfmpegArgs({
        config,
        outputPath: videoOutputPath,
        includeSystemAudio: false,
        includeMicrophone: config.recordMicrophone,
      });
      const ffmpeg = spawnProcess(options.ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });

      active = {
        config,
        process: ffmpeg,
        helper,
        systemAudioStream,
        outputPath,
        videoOutputPath,
        systemAudioPath: includeSystemAudio ? systemAudioPath : undefined,
        systemAudioFinished: includeSystemAudio ? systemAudioFinished : undefined,
        warnings,
        closed: createClosedPromise(ffmpeg),
      };
      setState({
        status: "recording",
        startedAt: now().toISOString(),
        outputPath,
        warnings,
      });

      return { state };
    },
    async stop() {
      if (!active) {
        return { state: idleState, warnings: [] };
      }

      const current = active;
      setState({ ...state, status: "stopping" });
      current.helper?.kill?.();
      current.systemAudioStream?.end?.();
      requestGracefulStop(current.process);
      await waitForCloseOrKill(current, stopTimeoutMs);
      await current.systemAudioFinished;

      if (current.systemAudioPath) {
        await runMergeProcess(buildSystemAudioMergeArgs(current.config, current.videoOutputPath, current.systemAudioPath, current.outputPath));
        cleanupSidecarFile(current.videoOutputPath, unlinkSync);
        cleanupSidecarFile(current.systemAudioPath, unlinkSync);
      }

      active = undefined;
      setState(idleState);

      return {
        state,
        outputPath: current.outputPath,
        warnings: current.warnings,
      };
    },
    async listAudioDevices() {
      if (!existsSync(options.ffmpegPath)) {
        return [];
      }

      const ffmpeg = spawnProcess(options.ffmpegPath, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      ffmpeg.stderr?.on("data", (chunk) => {
        stderr = appendProcessChunk(stderr, chunk);
      });
      await createClosedPromise(ffmpeg);

      return parseDirectShowAudioDevices(stderr);
    },
    onStateChanged(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}