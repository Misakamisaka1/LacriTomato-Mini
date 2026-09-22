import { Heart, Sparkles, UtensilsCrossed } from "lucide-react";
import type { ComponentType } from "react";
import { petVitalsStatLabels, type PetVitalsStatKey } from "../../shared/petVitals";
import "./../shell/PetVitals.css";

const statIcons: Record<PetVitalsStatKey, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  affinity: Heart,
  satiety: UtensilsCrossed,
  mood: Sparkles,
};

const lowStatThreshold = 25;

interface PetVitalsBarProps {
  statKey: PetVitalsStatKey;
  value: number;
  size?: "compact" | "detail";
  showTicks?: boolean;
}

function roundValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function PetVitalsBar({ statKey, value, size = "compact", showTicks = false }: PetVitalsBarProps) {
  const Icon = statIcons[statKey];
  const safeValue = Math.max(0, Math.min(100, value));
  const rounded = roundValue(safeValue);
  const low = safeValue < lowStatThreshold;

  return (
    <div
      className={`pv-bar pv-bar--${statKey} pv-bar--${size}${low ? " is-low" : ""}`}
      data-stat={statKey}
      role="progressbar"
      aria-label={petVitalsStatLabels[statKey]}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
    >
      <span className="pv-bar__icon" aria-hidden>
        <Icon size={size === "detail" ? 14 : 13} />
      </span>
      <span className="pv-bar__label">{petVitalsStatLabels[statKey]}</span>
      <span className="pv-bar__value">
        {low && <i className="pv-bar__alert" aria-hidden />}
        {rounded}
        <em>%</em>
      </span>
      <span className="pv-bar__track">
        <span className="pv-bar__fill" style={{ width: `${safeValue}%` }}>
          <span className="pv-bar__shine" aria-hidden />
        </span>
        {showTicks && (
          <span className="pv-bar__ticks" aria-hidden>
            {[25, 50, 75].map((tick) => <i key={tick} style={{ left: `${tick}%` }} />)}
          </span>
        )}
      </span>
    </div>
  );
}