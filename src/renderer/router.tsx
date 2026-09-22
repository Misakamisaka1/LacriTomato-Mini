import { ChatPanel } from "../plugins/chat/renderer/ChatPanel";
import { PinnedImageView } from "../plugins/screenshot/renderer/PinnedImageView";
import { RecordingControl } from "../plugins/recording/renderer/RecordingControl";
import { ScreenshotOverlay } from "../plugins/screenshot/renderer/ScreenshotOverlay";
import { ScreenshotTip } from "../plugins/screenshot/renderer/ScreenshotTip";
import { TranslatorPanel } from "../plugins/translator/renderer/TranslatorPanel";
import { PetApp } from "./shell/PetApp";
import { PetBubbleLayer } from "./shell/PetBubbleLayer";
import { PetMenuLayer } from "./shell/PetMenuLayer";
import { PetVitalsLayer } from "./shell/PetVitalsLayer";
import { SettingsApp } from "./shell/SettingsApp";

export function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "pet") {
    return <PetApp />;
  }

  if (view === "pet-bubble") {
    return <PetBubbleLayer />;
  }

  if (view === "pet-menu") {
    return <PetMenuLayer />;
  }

  if (view === "pet-status") {
    return <PetVitalsLayer />;
  }

  if (view === "translator") {
    return <TranslatorPanel />;
  }

  if (view === "settings") {
    return <SettingsApp />;
  }

  if (view === "chat") {
    return <ChatPanel />;
  }

  if (view === "recording-control") {
    return <RecordingControl />;
  }

  if (view === "screenshot-overlay") {
    return <ScreenshotOverlay />;
  }

  if (view === "pinned-image") {
    return <PinnedImageView />;
  }

  if (view === "screenshot-tip") {
    return <ScreenshotTip />;
  }

  return <PetApp />;
}
