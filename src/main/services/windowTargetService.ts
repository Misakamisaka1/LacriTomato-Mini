import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Rectangle } from "electron";
import type { ScreenshotWindowTarget } from "../../plugins/screenshot/workflow.js";

const execFileAsync = promisify(execFile);

export interface NativeWindowTarget extends ScreenshotWindowTarget {
  processId: number;
}

const enumWindowsScript = String.raw`
$code = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class PetdexWin32WindowTarget {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
Add-Type $code
$items = New-Object System.Collections.Generic.List[object]
[PetdexWin32WindowTarget]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if (-not [PetdexWin32WindowTarget]::IsWindowVisible($hWnd)) { return $true }
  $titleLength = [PetdexWin32WindowTarget]::GetWindowTextLength($hWnd)
  if ($titleLength -le 0) { return $true }
  $titleBuilder = New-Object System.Text.StringBuilder ($titleLength + 1)
  [void][PetdexWin32WindowTarget]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $rect = New-Object PetdexWin32WindowTarget+RECT
  if (-not [PetdexWin32WindowTarget]::GetWindowRect($hWnd, [ref]$rect)) { return $true }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 32 -or $height -lt 32) { return $true }
  $processId = 0
  [void][PetdexWin32WindowTarget]::GetWindowThreadProcessId($hWnd, [ref]$processId)
  $items.Add([pscustomobject]@{
    id = $hWnd.ToInt64().ToString()
    title = $titleBuilder.ToString()
    x = $rect.Left
    y = $rect.Top
    width = $width
    height = $height
    processId = [int]$processId
  }) | Out-Null
  return $true
}, [IntPtr]::Zero) | Out-Null
$items | ConvertTo-Json -Compress
`;

function intersects(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function clipToOverlay(target: NativeWindowTarget, overlayBounds: Rectangle): ScreenshotWindowTarget | undefined {
  const absolute = { x: target.x, y: target.y, width: target.width, height: target.height };
  if (!intersects(absolute, overlayBounds)) {
    return undefined;
  }

  const left = Math.max(target.x, overlayBounds.x);
  const top = Math.max(target.y, overlayBounds.y);
  const right = Math.min(target.x + target.width, overlayBounds.x + overlayBounds.width);
  const bottom = Math.min(target.y + target.height, overlayBounds.y + overlayBounds.height);
  const width = Math.round(right - left);
  const height = Math.round(bottom - top);

  if (width < 32 || height < 32) {
    return undefined;
  }

  return {
    id: target.id,
    title: target.title,
    x: Math.round(left - overlayBounds.x),
    y: Math.round(top - overlayBounds.y),
    width,
    height,
  };
}

export function mapWindowTargetsToOverlay(
  targets: NativeWindowTarget[],
  overlayBounds: Rectangle,
  currentProcessId = process.pid,
): ScreenshotWindowTarget[] {
  return targets
    .filter((target) => target.processId !== currentProcessId)
    .map((target) => clipToOverlay(target, overlayBounds))
    .filter((target): target is ScreenshotWindowTarget => Boolean(target));
}

function parseNativeTargets(stdout: string): NativeWindowTarget[] {
  if (!stdout.trim()) {
    return [];
  }

  const parsed = JSON.parse(stdout) as NativeWindowTarget | NativeWindowTarget[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function listNativeWindowTargets(): Promise<NativeWindowTarget[]> {
  if (process.platform !== "win32") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      enumWindowsScript,
    ], {
      windowsHide: true,
      timeout: 1500,
      maxBuffer: 1024 * 1024,
    });
    return parseNativeTargets(stdout);
  } catch {
    return [];
  }
}

export async function listScreenshotWindowTargets(overlayBounds: Rectangle): Promise<ScreenshotWindowTarget[]> {
  const targets = await listNativeWindowTargets();
  return mapWindowTargetsToOverlay(targets, overlayBounds);
}