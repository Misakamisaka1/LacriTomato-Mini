import type { PluginMenuItem } from "../../shared/pluginTypes";
import { PetHeadMenu } from "../components/PetHeadMenu";
import "./PetApp.css";

type PetMenuPlacement = "top" | "left" | "right";

function isPetMenuPlacement(value: string | null): value is PetMenuPlacement {
  return value === "top" || value === "left" || value === "right";
}

function readMenuItemsFromQuery(): PluginMenuItem[] {
  const rawItems = new URLSearchParams(window.location.search).get("items");

  if (!rawItems) {
    return [];
  }

  try {
    const items = JSON.parse(rawItems) as Partial<PluginMenuItem>[];
    return Array.isArray(items)
      ? items.flatMap((item) => (
        typeof item.id === "string"
        && typeof item.label === "string"
        && typeof item.action === "string"
          ? [{
            id: item.id,
            label: item.label,
            action: item.action,
            icon: typeof item.icon === "string" ? item.icon : "Settings",
            disabled: Boolean(item.disabled),
          }]
          : []
      ))
      : [];
  } catch {
    return [];
  }
}

export function PetMenuLayer() {
  const params = new URLSearchParams(window.location.search);
  const rawPlacement = params.get("placement");
  const placement = isPetMenuPlacement(rawPlacement) ? rawPlacement : "top";
  const items = readMenuItemsFromQuery();

  return (
    <main className="pet-menu-layer" data-placement={placement}>
      <PetHeadMenu
        open
        items={items}
        placement={placement}
        onAction={(action) => {
          void window.petdex?.pet?.selectMenuAction(action);
        }}
      />
    </main>
  );
}
