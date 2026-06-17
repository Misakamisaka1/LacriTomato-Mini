import { ScreenshotOverlay } from "../plugins/screenshot/renderer/ScreenshotOverlay";
import { TranslatorPanel } from "../plugins/translator/renderer/TranslatorPanel";
import { PetApp } from "./shell/PetApp";
import { SettingsApp } from "./shell/SettingsApp";

export function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "pet") {
    return <PetApp />;
  }

  if (view === "translator") {
    return <TranslatorPanel />;
  }

  if (view === "settings") {
    return <SettingsApp />;
  }

  if (view === "screenshot-overlay") {
    return <ScreenshotOverlay />;
  }

  return <PetApp />;
}
