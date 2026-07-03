import { useEffect, useMemo, useState } from "react";
import { Loader2, Square, Timer, Video, X } from "lucide-react";
import type { RecordingState } from "../../recording/types";
import "./recording-control.css";

const tickMs = 500;
const closeAfterStopMs = 1400;

function formatElapsed(startedAt: string | undefined, now: number) {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsedSeconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

const idleState: RecordingState = { status: "idle", warnings: [] };

export function RecordingControl() {
  const [recordingState, setRecordingState] = useState<RecordingState>(idleState);
  const [busy, setBusy] = useState<"starting" | "stopping" | undefined>();
  const [hovering, setHovering] = useState(false);
  const [notice, setNotice] = useState("准备录制");
  const [now, setNow] = useState(() => Date.now());
  const isRecording = recordingState.status === "recording";
  const isStopping = recordingState.status === "stopping" || busy === "stopping";
  const isStarting = busy === "starting";
  const elapsed = useMemo(() => formatElapsed(recordingState.startedAt, now), [now, recordingState.startedAt]);

  useEffect(() => {
    let active = true;
    void window.petdex?.recording?.getState()
      .then((state) => {
        if (!active || !state) {
          return;
        }
        setRecordingState(state);
        setNotice(state.status === "recording" ? "录制中" : "准备录制");
      })
      .catch((error) => setNotice(readErrorMessage(error, "录屏状态读取失败")));

    const unsubscribe = window.petdex?.recording?.onStateChanged?.((state) => {
      setRecordingState(state);
      if (state.status === "recording") {
        setNotice("录制中");
      } else if (state.status === "stopping") {
        setNotice("正在停止");
      } else {
        setNotice("准备录制");
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, []);

  async function startRecording() {
    if (isStarting || isStopping || isRecording) {
      return;
    }

    setBusy("starting");
    setNotice("正在启动");
    try {
      const result = await window.petdex?.recording?.start();
      if (result?.state) {
        setRecordingState(result.state);
        const warning = result.state.warnings[0]?.message;
        setNotice(warning ? warning : "录制中");
      }
    } catch (error) {
      setNotice(readErrorMessage(error, "录屏启动失败"));
    } finally {
      setBusy(undefined);
    }
  }

  function closeToolbar() {
    void window.petdex?.windowControls.close();
  }

  async function stopRecording() {
    if (!isRecording || isStopping) {
      return;
    }

    setBusy("stopping");
    setNotice("正在停止");
    try {
      const result = await window.petdex?.recording?.stop();
      if (result?.state) {
        setRecordingState(result.state);
      }
      const warning = result?.warnings?.[0]?.message;
      setNotice(warning ? `已保存，${warning}` : "录屏已保存");
      window.setTimeout(() => {
        void window.petdex?.windowControls.close();
      }, closeAfterStopMs);
    } catch (error) {
      setNotice(readErrorMessage(error, "录屏停止失败"));
    } finally {
      setBusy(undefined);
      setHovering(false);
    }
  }

  const buttonLabel = isStarting
    ? "正在启动"
    : isStopping
      ? "正在停止"
      : isRecording
        ? hovering ? "停止录制" : "录制中"
        : "开始录制";
  const buttonIcon = isStarting || isStopping
    ? <Loader2 size={14} aria-hidden className="recording-control__spin" />
    : isRecording && hovering
      ? <Square size={14} aria-hidden />
      : <Video size={14} aria-hidden />;

  return (
    <main className="recording-control-root" role="status" aria-live="polite">
      <section
        className="recording-control"
        data-recording={isRecording ? "true" : undefined}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <button
          type="button"
          className="recording-control__button"
          disabled={isStarting || isStopping}
          onClick={() => {
            if (isRecording) {
              void stopRecording();
              return;
            }
            void startRecording();
          }}
        >
          {buttonIcon}
          <span>{buttonLabel}</span>
        </button>
        <div className="recording-control__meta" aria-label="录屏状态">
          {isRecording ? <Timer size={14} aria-hidden /> : <span className="recording-control__dot" aria-hidden />}
          <span>{isRecording ? elapsed : notice}</span>
        </div>
        <button
          type="button"
          className="recording-control__close"
          aria-label="关闭录制工具栏"
          title="关闭录制工具栏"
          onClick={closeToolbar}
        >
          <X size={14} aria-hidden />
        </button>
      </section>
    </main>
  );
}