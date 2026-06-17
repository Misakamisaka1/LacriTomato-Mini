import { useEffect, useMemo, useState } from "react";
import type { PluginMenuItem } from "../../shared/pluginTypes";
import { PetHeadMenu } from "../components/PetHeadMenu";
import { PetSprite } from "../components/PetSprite";
import "./PetApp.css";

const fallbackMenuItems: PluginMenuItem[] = [
  { id: "translator.open", label: "翻译", action: "translator.open", icon: "Languages" },
  { id: "screenshot.capture", label: "截图", action: "screenshot.capture", icon: "ScanLine" },
  { id: "screenshot.captureOcr", label: "截图并 OCR", action: "screenshot.captureOcr", icon: "ScanText" },
  { id: "screenshot.pins", label: "贴图管理", action: "screenshot.openPins", icon: "Pin" },
  { id: "chat.open", label: "和我聊天", action: "chat.open", icon: "MessageCircle", disabled: true },
  { id: "settings.open", label: "设置", action: "settings.open", icon: "Settings" },
];

export function PetApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>(fallbackMenuItems);
  const [frame, setFrame] = useState(0);
  const frames = useMemo(() => [0, 1, 2, 3, 4, 5], []);

  useEffect(() => {
    window.petdex?.plugins.listMenuItems().then((items) => {
      setMenuItems([...items, fallbackMenuItems[4], fallbackMenuItems[5]]);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((value) => (value + 1) % frames.length);
    }, 160);

    return () => window.clearInterval(timer);
  }, [frames.length]);

  async function invoke(action: string) {
    if (action === "chat.open") {
      setMenuOpen(false);
      return;
    }

    await window.petdex?.plugins.invokeAction(action);
    setMenuOpen(false);
  }

  return (
    <main
      className="pet-root"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen((value) => !value);
      }}
    >
      <PetHeadMenu open={menuOpen} items={menuItems} onAction={invoke} />
      <PetSprite
        spritesheetUrl="../../assets/pet/spritesheet.webp"
        frameWidth={192}
        frameHeight={208}
        frameIndex={frames[frame]}
        columns={8}
        displayHeight={224}
      />
    </main>
  );
}
