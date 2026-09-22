import {
  Candy,
  ChevronDown,
  ChevronUp,
  Clock,
  Gamepad2,
  Heart,
  Move,
  Settings,
  Sparkles,
  Star,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  buildPetVitalsEffects,
  checkPetVitalsAction,
  formatPetVitalsEffects,
  petVitalsActionCatalog,
  petVitalsActionIds,
  type PetVitalsActionDefinition,
  type PetVitalsActionId,
  type PetVitalsSnapshot,
  type PetVitalsStatusAnchor,
  type PetVitalsStatusPlacement,
} from "../../shared/petVitals";
import { PetVitalsBar } from "./PetVitalsBar";
import "../shell/PetVitals.css";

export interface PetVitalsToast {
  id: number;
  text: string;
  tone: "gain" | "warn";
}

interface PetVitalsPanelProps {
  snapshot?: PetVitalsSnapshot;
  expanded: boolean;
  placement: PetVitalsStatusPlacement;
  anchor?: PetVitalsStatusAnchor;
  tailOffset?: number;
  petName?: string;
  busyAction?: PetVitalsActionId;
  toast?: PetVitalsToast;
  loading?: boolean;
  onToggle(): void;
  onAction(action: PetVitalsActionId): void;
  onOpenSettings?(): void;
  /** Drag support: called with the screen-space delta of each drag step. */
  onMoveBy?(deltaX: number, deltaY: number): void;
  /** Called once when a drag finishes so the position can be pinned. */
  onDragEnd?(): void;
  onFollowPet?(): void;
}

/** A pointer has to travel this far before a click becomes a drag. */
const dragThreshold = 4;

const actionIcons: Record<PetVitalsActionId, LucideIcon> = {
  feed: UtensilsCrossed,
  treat: Candy,
  play: Gamepad2,
  pet: Heart,
};

function compactEffectHint(definition: PetVitalsActionDefinition) {
  const primary = buildPetVitalsEffects(definition)
    .filter((effect) => effect.key !== "points")
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];

  return primary ? `${primary.label} ${primary.delta > 0 ? "+" : ""}${primary.delta}` : "羁绊 +";
}

function formatRelativeTime(value: number, now: number) {
  if (!value) {
    return "还没有互动";
  }

  const minutes = Math.max(0, Math.round((now - value) / 60000));
  if (minutes < 1) {
    return "刚刚互动过";
  }

  if (minutes < 60) {
    return `${minutes} 分钟前互动`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前互动`;
  }

  return `${Math.round(hours / 24)} 天前互动`;
}

export function PetVitalsPanel({
  snapshot,
  expanded,
  placement,
  anchor = "auto",
  tailOffset = 46,
  petName,
  busyAction,
  toast,
  loading,
  onToggle,
  onAction,
  onOpenSettings,
  onMoveBy,
  onDragEnd,
  onFollowPet,
}: PetVitalsPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  // A finished drag still fires a click; the toggle has to ignore that one.
  const suppressClickRef = useRef(false);
  const hasPendingCooldown = Boolean(snapshot && petVitalsActionIds.some(
    (action) => (snapshot.cooldownUntilMs[action] ?? 0) > now,
  ));

  useEffect(() => {
    if (!hasPendingCooldown) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [hasPendingCooldown]);

  function handleHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!onMoveBy || event.button !== 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleHeaderPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (!drag.moved) {
      const travelled = Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY);
      if (travelled < dragThreshold) {
        return;
      }

      drag.moved = true;
      setDragging(true);
    }

    const deltaX = event.screenX - drag.lastX;
    const deltaY = event.screenY - drag.lastY;
    drag.lastX = event.screenX;
    drag.lastY = event.screenY;

    if (deltaX || deltaY) {
      onMoveBy?.(deltaX, deltaY);
    }
  }

  function handleHeaderPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!drag) {
      return;
    }

    setDragging(false);

    if (drag.moved) {
      // Keep the dropped position, ignore the click that follows.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      onDragEnd?.();
    }
  }

  function handleHeaderClick() {
    if (suppressClickRef.current) {
      return;
    }

    onToggle();
  }

  if (!snapshot) {
    return (
      <section className="pv-card pv-card--compact is-loading" data-placement={placement} aria-busy="true">
        <p className="pv-loading">{loading === false ? "养成服务未连接" : "正在读取宠物状态…"}</p>
      </section>
    );
  }

  const warning = snapshot.warnings[0];
  const levelProgress = Math.max(0, Math.min(1, snapshot.levelProgress));
  const cardClassName = [
    "pv-card",
    expanded ? "pv-card--expanded" : "pv-card--compact",
    snapshot.paused ? "is-paused" : "",
    warning ? "is-warning" : "",
    dragging ? "is-dragging" : "",
  ].filter(Boolean).join(" ");
  const dragTitle = anchor === "custom" ? "当前为自由位置，拖动可继续调整" : "拖动可自由摆放状态栏";

  function handleHeaderKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  }

  return (
    <section
      className={cardClassName}
      data-placement={placement}
      data-anchor={anchor}
      data-dragging={dragging ? "true" : undefined}
      data-warning={warning?.kind}
      data-paused={snapshot.paused ? "true" : undefined}
      style={{ "--pv-tail-top": `${tailOffset}px` } as CSSProperties}
      aria-label="宠物状态栏"
    >
      {expanded && toast && (
        <span className={`pv-toast pv-toast--${toast.tone}`} key={toast.id} role="status" aria-live="polite">
          {toast.tone === "gain" && (
            <span className="pv-toast__sparks" aria-hidden>
              <i /><i /><i />
            </span>
          )}
          {toast.text}
        </span>
      )}
      <header
        className="pv-card__header"
        onClick={handleHeaderClick}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
        onKeyDown={handleHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "收起宠物状态栏" : "展开宠物状态栏"}
        title={`${dragTitle} · ${expanded ? "点击收起" : "点击展开"}`}
      >
        <span className="pv-level" style={{ "--pv-progress": levelProgress } as CSSProperties} aria-hidden>
          <span className="pv-level__inner">{snapshot.level}</span>
        </span>
        <span className="pv-card__title">
          <strong>{petName ?? "LacriTomato Mini"}</strong>
          <span className="pv-card__meta">Lv.{snapshot.level} · {snapshot.levelTitle}</span>
        </span>
        <span className={`pv-mood pv-mood--${snapshot.moodKey}`}>
          <i aria-hidden />
          {snapshot.moodLabel}
        </span>
        <span className="pv-card__chevron" aria-hidden>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </header>

      <div className="pv-bars">
        <PetVitalsBar statKey="affinity" value={snapshot.stats.affinity} size={expanded ? "detail" : "compact"} showTicks={expanded} />
        <PetVitalsBar statKey="satiety" value={snapshot.stats.satiety} size={expanded ? "detail" : "compact"} showTicks={expanded} />
        <PetVitalsBar statKey="mood" value={snapshot.stats.mood} size={expanded ? "detail" : "compact"} showTicks={expanded} />
      </div>

      {!expanded && (
        <footer className="pv-card__hint">
          <span className={`pv-status pv-status--${snapshot.moodKey}`}>
            <Sparkles size={12} aria-hidden />
            {snapshot.statusLabel}
          </span>
          <span className="pv-card__tap">
            <Move size={10} aria-hidden />
            {onMoveBy ? "拖动移动 · 点击展开" : "点击展开"}
          </span>
        </footer>
      )}

      {expanded && (
        <>
          <div className="pv-actions" role="group" aria-label="照顾宠物">
            {petVitalsActionIds.map((actionId) => {
              const definition = petVitalsActionCatalog[actionId];
              const Icon = actionIcons[actionId];
              const cooldownMs = Math.max(0, (snapshot.cooldownUntilMs[actionId] ?? 0) - now);
              const requirement = checkPetVitalsAction(definition, snapshot.stats);
              const disabled = Boolean(busyAction) || cooldownMs > 0 || !requirement.ok;
              const hint = !requirement.ok
                ? "现在不行"
                : cooldownMs > 0
                  ? `${Math.ceil(cooldownMs / 1000)}s`
                  : compactEffectHint(definition);

              return (
                <button
                  key={actionId}
                  type="button"
                  className={`pv-action pv-action--${definition.accent}${busyAction === actionId ? " is-busy" : ""}`}
                  data-action={actionId}
                  disabled={disabled}
                  title={requirement.ok ? `${definition.description} · ${formatPetVitalsEffects(buildPetVitalsEffects(definition))}` : requirement.message}
                  onClick={() => onAction(actionId)}
                >
                  <Icon size={16} aria-hidden />
                  <span className="pv-action__label">{definition.label}</span>
                  <span className="pv-action__hint">{hint}</span>
                  {cooldownMs > 0 && (
                    <span
                      className="pv-action__cooldown"
                      aria-hidden
                      style={{ width: `${Math.min(100, (cooldownMs / definition.cooldownMs) * 100)}%` }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="pv-bond" aria-label={`羁绊进度 ${Math.round(levelProgress * 100)}%`}>
            <span className="pv-bond__label">
              <Star size={12} aria-hidden />
              羁绊进度
            </span>
            <span className="pv-bond__track">
              <span className="pv-bond__fill" style={{ width: `${levelProgress * 100}%` }} />
            </span>
            <span className="pv-bond__value">
              {snapshot.nextLevelPoints ? `${snapshot.points} / ${snapshot.nextLevelPoints}` : `${snapshot.points} 满级`}
            </span>
          </div>

          {warning && (
            <p className="pv-warning" role="status">
              <TriangleAlert size={12} aria-hidden />
              {warning.message}
            </p>
          )}

          {snapshot.paused && <p className="pv-warning pv-warning--paused">养成系统已暂停，累计数据仍会保留</p>}

          <div className="pv-position" data-anchor={anchor}>
            <span className="pv-position__state">
              <Move size={12} aria-hidden />
              {anchor === "custom" ? "自由位置" : "跟随宠物"}
            </span>
            {anchor === "custom" && onFollowPet ? (
              <button type="button" className="pv-link" onClick={onFollowPet}>
                回到宠物身边
              </button>
            ) : (
              <span className="pv-position__hint">{onMoveBy ? "拖动标题可自由摆放" : "自动停在宠物旁边"}</span>
            )}
          </div>

          <footer className="pv-card__footer">
            <span className="pv-totals">
              <Clock size={11} aria-hidden />
              {formatRelativeTime(snapshot.lastInteractionAtMs, now)}
            </span>
            <span className="pv-totals">
              喂食 {snapshot.totals.feed} · 玩耍 {snapshot.totals.play} · 抚摸 {snapshot.totals.pet}
            </span>
            {onOpenSettings && (
              <button type="button" className="pv-link" onClick={onOpenSettings}>
                <Settings size={12} aria-hidden />
                养成设置
              </button>
            )}
          </footer>
        </>
      )}
    </section>
  );
}