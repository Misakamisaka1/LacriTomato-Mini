import { CheckCircle2 } from "lucide-react";
import "./screenshot.css";

const defaultMessage = "截图已复制到剪贴板";

function readTipMessage() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("message")?.trim();
  return message || defaultMessage;
}

export function ScreenshotTip() {
  return (
    <main className="screenshot-tip-root" role="status">
      <section className="screenshot-tip-card" aria-label="截图提示">
        <CheckCircle2 size={24} aria-hidden />
        <span>{readTipMessage()}</span>
      </section>
    </main>
  );
}
