import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingControl } from "../../src/plugins/recording/renderer/RecordingControl";

const getState = vi.fn();
const start = vi.fn();
const stop = vi.fn();
const closeWindow = vi.fn();
let stateListener: ((state: { status: "idle" | "recording" | "stopping"; startedAt?: string; warnings: [] }) => void) | undefined;

function isoSecondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe("RecordingControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateListener = undefined;
    getState.mockResolvedValue({ status: "idle", warnings: [] });
    start.mockResolvedValue({ state: { status: "recording", startedAt: isoSecondsAgo(0), warnings: [] } });
    stop.mockResolvedValue({ state: { status: "idle", warnings: [] }, outputPath: "C:/tmp/recording.mp4", warnings: [] });
    window.petdex = {
      config: {} as never,
      plugins: {} as never,
      model: {} as never,
      recording: {
        getState,
        start,
        stop,
        listAudioDevices: vi.fn(),
        onStateChanged: vi.fn((callback) => {
          stateListener = callback as never;
          return vi.fn();
        }),
      },
      windowControls: {
        close: closeWindow,
      },
    };
  });

  it("shows a start button and starts recording only after the user clicks it", async () => {
    render(<RecordingControl />);

    expect(await screen.findByRole("button", { name: "开始录制" })).toBeTruthy();
    expect(start).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "开始录制" }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("录制中")).toBeTruthy();
  });

  it("closes the toolbar without starting or stopping recording", async () => {
    render(<RecordingControl />);

    fireEvent.click(await screen.findByRole("button", { name: "关闭录制工具栏" }));

    expect(closeWindow).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
  it("shows elapsed time and turns into stop control while hovering", async () => {
    getState.mockResolvedValue({ status: "recording", startedAt: isoSecondsAgo(5), warnings: [] });

    render(<RecordingControl />);

    expect(await screen.findByText("00:05")).toBeTruthy();
    const button = screen.getByRole("button", { name: "录制中" });

    fireEvent.mouseEnter(button);
    expect(screen.getByRole("button", { name: "停止录制" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停止录制" }));

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  });

  it("updates when the main process broadcasts recording state", async () => {
    render(<RecordingControl />);
    await screen.findByRole("button", { name: "开始录制" });

    await act(async () => {
      stateListener?.({ status: "recording", startedAt: isoSecondsAgo(3), warnings: [] });
    });

    expect(await screen.findByText("00:03")).toBeTruthy();
  });
});