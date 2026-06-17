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

  return <PetApp />;
}
