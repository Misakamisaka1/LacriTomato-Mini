import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const helperPath = join(process.cwd(), "assets", "recording", "wasapi-loopback-helper.exe");
const isRunnable = process.platform === "win32" && existsSync(helperPath);

function captureHelperBytes(durationMs: number, maxBytesBeforeKill: number) {
  return new Promise<{ bytes: number; stderr: string }>((resolve, reject) => {
    const child = spawn(helperPath, ["--format", "s16le", "--rate", "48000", "--channels", "2"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let bytes = 0;
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
    }, durationMs);

    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytesBeforeKill) {
        child.kill();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      finish(() => reject(error));
    });
    child.once("close", () => {
      clearTimeout(timer);
      finish(() => resolve({ bytes, stderr }));
    });
  });
}

describe("WASAPI loopback helper runtime", () => {
  it.skipIf(!isRunnable)("does not flood silent PCM faster than real time", async () => {
    const maxBytes = 8 * 1024 * 1024;
    const result = await captureHelperBytes(1500, maxBytes);

    expect(result.bytes).toBeLessThan(maxBytes);
  }, 15_000);
});
