import type { CSSProperties } from "react";
import { Activity, Languages, MessageCircle, Pin, ScanLine, ScanText, Settings, Video } from "lucide-react";
import type { PluginMenuItem } from "../../shared/pluginTypes";
import "../shell/PetApp.css";

const icons = {
  Activity,
  Languages,
  MessageCircle,
  Pin,
  ScanLine,
  ScanText,
  Settings,
  Video,
};

interface PetHeadMenuProps {
  open: boolean;
  items: PluginMenuItem[];
  placement?: "top" | "left" | "right";
  onAction(action: string): void;
}

export function PetHeadMenu({ open, items, placement = "top", onAction }: PetHeadMenuProps) {
  if (!open) {
    return null;
  }

  const menuStyle = placement === "top"
    ? { bottom: "calc(var(--pet-height) + var(--pet-menu-gap))" }
    : undefined;

  return (
    <div
      className={`pet-head-menu pet-head-menu--${placement}`}
      data-placement={placement}
      style={menuStyle}
      aria-label="宠物功能菜单"
    >
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
