import type { CSSProperties } from "react";
import { Languages, MessageCircle, Pin, ScanLine, ScanText, Settings } from "lucide-react";
import type { PluginMenuItem } from "../../shared/pluginTypes";
import "../shell/PetApp.css";

const icons = {
  Languages,
  MessageCircle,
  Pin,
  ScanLine,
  ScanText,
  Settings,
};

interface PetHeadMenuProps {
  open: boolean;
  items: PluginMenuItem[];
  onAction(action: string): void;
}

export function PetHeadMenu({ open, items, onAction }: PetHeadMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="pet-head-menu" aria-label="宠物功能菜单">
      {items.map((item, index) => {
        const Icon = icons[item.icon as keyof typeof icons] ?? Settings;

        return (
          <button
            key={item.id}
            className="pet-head-menu__key"
            style={{ "--delay": `${index * 42}ms` } as CSSProperties}
            type="button"
            aria-label={item.label}
            disabled={item.disabled}
            onClick={() => onAction(item.action)}
          >
            <Icon size={18} aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
