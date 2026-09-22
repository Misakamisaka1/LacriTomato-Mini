import type { PetEmotion } from "./petBehavior.js";

/**
 * Pet vitals (养成系统): current affinity / satiety / mood meters plus the
 * long-lived bond points that drive the bond level.
 *
 * Everything in this module is pure so the main process, the renderer and the
 * tests all share exactly one implementation of the numbers.
 */

export type PetVitalsStatKey = "affinity" | "satiety" | "mood";
export type PetVitalsActionId = "feed" | "treat" | "play" | "pet";
export type PetVitalsNeedKind = "hungry" | "lonely" | "bored";
export type PetVitalsMoodKey = "delighted" | "happy" | "neutral" | "low";
export type PetVitalsAccent = "rose" | "amber" | "violet" | "sky";

export interface PetVitalsDecayRates {
  satietyPerHour: number;
  moodPerHour: number;
  affinityPerHour: number;
}

export interface PetVitalsTotals {
  feed: number;
  treat: number;
  play: number;
  pet: number;
}

export interface PetVitalsState {
  affinity: number;
  satiety: number;
  mood: number;
  /** Lifetime bond points. They never decay, so the bond level is permanent. */
  points: number;
  lastUpdatedMs: number;
  lastInteractionAtMs: number;
  lastBonusDayKey: string;
  cooldownUntilMs: Partial<Record<PetVitalsActionId, number>>;
  totals: PetVitalsTotals;
}

export interface PetVitalsWarning {
  kind: PetVitalsNeedKind;
  message: string;
}

export interface PetVitalsSnapshot {
  enabled: boolean;
  paused: boolean;
  stats: Record<PetVitalsStatKey, number>;
  level: number;
  levelTitle: string;
  /** Progress inside the current level band, 0..1. */
  levelProgress: number;
  points: number;
  nextLevelPoints?: number;
  moodKey: PetVitalsMoodKey;
  moodLabel: string;
  statusLabel: string;
  warnings: PetVitalsWarning[];
  cooldownUntilMs: Record<PetVitalsActionId, number>;
  totals: PetVitalsTotals;
  lastInteractionAtMs: number;
  updatedAtMs: number;
  hudMode: PetVitalsHudMode;
}

export interface PetVitalsEffectPreview {
  key: PetVitalsStatKey | "points";
  label: string;
  delta: number;
}

export interface PetVitalsActionResult {
  ok: boolean;
  action: PetVitalsActionId;
  message: string;
  reaction: string;
  reactionEmotion: PetEmotion;
  effects: PetVitalsEffectPreview[];
  snapshot: PetVitalsSnapshot;
  reason?: "cooldown" | "requirement";
  cooldownUntilMs?: number;
}

export interface PetVitalsNeedEvent {
  kind: PetVitalsNeedKind;
  message: string;
  emotion: PetEmotion;
}

export type PetVitalsStatusPlacement = "left" | "right";
export type PetVitalsStatusAnchor = "auto" | "custom";

/**
 * How the floating card shows up: pinned on the desktop, only after a left
 * click on the pet, or never automatically.
 */
export type PetVitalsHudMode = "always" | "click" | "hidden";

export const petVitalsHudModes: PetVitalsHudMode[] = ["always", "click", "hidden"];

export const petVitalsHudModeLabels: Record<PetVitalsHudMode, string> = {
  always: "常驻显示",
  click: "点击宠物显示",
  hidden: "不显示",
};

export const petVitalsHudModeHints: Record<PetVitalsHudMode, string> = {
  always: "状态栏一直停在宠物旁边",
  click: "左键点宠物才出现，点别处自动收起",
  hidden: "平时不显示，只能从右键菜单或托盘唤起",
};

/** Top-left screen position the user dragged the status card to. */
export interface PetVitalsHudPosition {
  x: number;
  y: number;
}

export interface PetVitalsStatusState {
  visible: boolean;
  expanded: boolean;
  placement: PetVitalsStatusPlacement;
  /** `auto` follows the pet, `custom` stays where the user dropped it. */
  anchor: PetVitalsStatusAnchor;
  /** Where the card currently sits when it is free-floating. */
  position: PetVitalsHudPosition | null;
  /** Distance from the card top to the pet's centre, used by the tail. */
  tailOffset: number;
}

export interface PetVitalsRequirement {
  /** Blocks the action while the current value stays above/below the threshold. */
  stat: PetVitalsStatKey;
  direction: "above" | "below";
  value: number;
  message: string;
}

export interface PetVitalsActionDefinition {
  id: PetVitalsActionId;
  label: string;
  description: string;
  icon: string;
  accent: PetVitalsAccent;
  cooldownMs: number;
  points: number;
  effects: Record<PetVitalsStatKey, number>;
  requirement?: PetVitalsRequirement;
  reaction: string;
  reactionEmotion: PetEmotion;
  blockedReaction: string;
  blockedEmotion: PetEmotion;
}

export interface PetBondLevelDefinition {
  level: number;
  title: string;
  minPoints: number;
}

export interface PetVitalsOptions {
  rates?: PetVitalsDecayRates;
  enabled?: boolean;
  hudMode?: PetVitalsHudMode;
}

export const petVitalsStatKeys: PetVitalsStatKey[] = ["affinity", "satiety", "mood"];

export const petVitalsStatLabels: Record<PetVitalsStatKey, string> = {
  affinity: "好感度",
  satiety: "饱食度",
  mood: "心情",
};

export const defaultPetVitalsDecayRates: PetVitalsDecayRates = {
  satietyPerHour: 4.2,
  moodPerHour: 3,
  affinityPerHour: 0.6,
};

/** Offline decay is capped so a long holiday never wipes the pet out. */
export const maxOfflineDecayMs = 72 * 60 * 60 * 1000;

export const petBondLevels: PetBondLevelDefinition[] = [
  { level: 1, title: "初次相遇", minPoints: 0 },
  { level: 2, title: "有点熟悉", minPoints: 120 },
  { level: 3, title: "朋友", minPoints: 320 },
  { level: 4, title: "好伙伴", minPoints: 640 },
  { level: 5, title: "亲密无间", minPoints: 1100 },
  { level: 6, title: "知己", minPoints: 1700 },
  { level: 7, title: "心有灵犀", minPoints: 2500 },
  { level: 8, title: "离不开你", minPoints: 3600 },
  { level: 9, title: "一生相伴", minPoints: 5000 },
  { level: 10, title: "灵魂羁绊", minPoints: 7000 },
];

export const petVitalsActionIds: PetVitalsActionId[] = ["feed", "treat", "play", "pet"];

export const petVitalsActionCatalog: Record<PetVitalsActionId, PetVitalsActionDefinition> = {
  feed: {
    id: "feed",
    label: "喂食",
    description: "端上一碗热乎的番茄饭",
    icon: "UtensilsCrossed",
    accent: "amber",
    cooldownMs: 45_000,
    points: 6,
    effects: { affinity: 2, satiety: 26, mood: 5 },
    requirement: {
      stat: "satiety",
      direction: "above",
      value: 92,
      message: "已经吃得饱饱的啦，过一会儿再喂吧",
    },
    reaction: "好好吃，谢谢你！",
    reactionEmotion: "happy",
    blockedReaction: "吃不下啦，先陪我走两步吧",
    blockedEmotion: "attentive",
  },
  treat: {
    id: "treat",
    label: "零食",
    description: "偷偷塞一块小点心",
    icon: "Candy",
    accent: "rose",
    cooldownMs: 90_000,
    points: 10,
    effects: { affinity: 3, satiety: 8, mood: 16 },
    requirement: {
      stat: "satiety",
      direction: "above",
      value: 96,
      message: "再吃就要撑到了，零食先收起来吧",
    },
    reaction: "是零食！最喜欢你了！",
    reactionEmotion: "jumping",
    blockedReaction: "肚子圆滚滚的，留着下次吃",
    blockedEmotion: "attentive",
  },
  play: {
    id: "play",
    label: "玩耍",
    description: "陪它玩一会儿小游戏",
    icon: "Gamepad2",
    accent: "violet",
    cooldownMs: 30_000,
    points: 12,
    effects: { affinity: 4, satiety: -9, mood: 22 },
    requirement: {
      stat: "satiety",
      direction: "below",
      value: 18,
      message: "肚子空空的，先喂点东西再玩吧",
    },
    reaction: "再玩一会儿嘛，我还没赢够！",
    reactionEmotion: "waving",
    blockedReaction: "没力气了，先吃点东西好不好…",
    blockedEmotion: "sleepy",
  },
  pet: {
    id: "pet",
    label: "抚摸",
    description: "轻轻顺一顺它的毛",
    icon: "Heart",
    accent: "sky",
    cooldownMs: 6_000,
    points: 4,
    effects: { affinity: 3, satiety: 0, mood: 7 },
    reaction: "呼噜呼噜～好舒服",
    reactionEmotion: "waving",
    blockedReaction: "再摸摸嘛",
    blockedEmotion: "attentive",
  },
};

const dailyBonusPoints = 8;

function clampStat(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function clampPoints(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function dayKeyOf(nowMs: number): string {
  const date = new Date(nowMs);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function createInitialPetVitals(nowMs = Date.now(), overrides: Partial<PetVitalsState> = {}): PetVitalsState {
  return {
    affinity: 24,
    satiety: 72,
    mood: 66,
    points: 0,
    lastUpdatedMs: nowMs,
    lastInteractionAtMs: nowMs,
    lastBonusDayKey: "",
    cooldownUntilMs: {},
    totals: { feed: 0, treat: 0, play: 0, pet: 0 },
    ...overrides,
  };
}

export function normalizePetVitalsState(state: PetVitalsState, nowMs = Date.now()): PetVitalsState {
  const cooldownUntilMs: Partial<Record<PetVitalsActionId, number>> = {};
  for (const actionId of petVitalsActionIds) {
    const until = state.cooldownUntilMs?.[actionId];
    if (typeof until === "number" && Number.isFinite(until) && until > nowMs) {
      cooldownUntilMs[actionId] = until;
    }
  }

  return {
    affinity: clampStat(state.affinity),
    satiety: clampStat(state.satiety),
    mood: clampStat(state.mood),
    points: clampPoints(state.points),
    lastUpdatedMs: Number.isFinite(state.lastUpdatedMs) ? state.lastUpdatedMs : nowMs,
    lastInteractionAtMs: Number.isFinite(state.lastInteractionAtMs) ? state.lastInteractionAtMs : nowMs,
    lastBonusDayKey: typeof state.lastBonusDayKey === "string" ? state.lastBonusDayKey : "",
    cooldownUntilMs,
    totals: {
      feed: clampPoints(state.totals?.feed ?? 0),
      treat: clampPoints(state.totals?.treat ?? 0),
      play: clampPoints(state.totals?.play ?? 0),
      pet: clampPoints(state.totals?.pet ?? 0),
    },
  };
}

export function getPetBondLevel(points: number): {
  level: number;
  title: string;
  minPoints: number;
  nextLevelPoints?: number;
  progress: number;
} {
  const safePoints = clampPoints(points);
  let current = petBondLevels[0];

  for (const definition of petBondLevels) {
    if (safePoints >= definition.minPoints) {
      current = definition;
    }
  }

  const next = petBondLevels.find((definition) => definition.minPoints > current.minPoints);
  if (!next) {
    return { level: current.level, title: current.title, minPoints: current.minPoints, progress: 1 };
  }

  const span = next.minPoints - current.minPoints;
  const progress = span > 0 ? Math.min(1, Math.max(0, (safePoints - current.minPoints) / span)) : 0;

  return {
    level: current.level,
    title: current.title,
    minPoints: current.minPoints,
    nextLevelPoints: next.minPoints,
    progress,
  };
}

export function decayPetVitals(
  state: PetVitalsState,
  nowMs: number,
  rates: PetVitalsDecayRates = defaultPetVitalsDecayRates,
): PetVitalsState {
  const elapsedMs = Math.min(Math.max(0, nowMs - state.lastUpdatedMs), maxOfflineDecayMs);
  if (elapsedMs <= 0) {
    return { ...state, lastUpdatedMs: nowMs };
  }

  const hours = elapsedMs / 3_600_000;
  // A full pet is a calm pet: mood holds much longer while satiety is high.
  const moodRate = rates.moodPerHour * (state.satiety >= 70 ? 0.5 : state.satiety < 20 ? 2 : 1);
  const affinityRate = rates.affinityPerHour * (state.satiety < 20 ? 2 : 1);

  return {
    ...state,
    satiety: clampStat(state.satiety - rates.satietyPerHour * hours),
    mood: clampStat(state.mood - moodRate * hours),
    affinity: clampStat(state.affinity - affinityRate * hours),
    lastUpdatedMs: nowMs,
  };
}

export function checkPetVitalsAction(
  definition: PetVitalsActionDefinition,
  stats: Record<PetVitalsStatKey, number>,
): { ok: true } | { ok: false; message: string } {
  const requirement = definition.requirement;
  if (!requirement) {
    return { ok: true };
  }

  const value = stats[requirement.stat];
  const blocked = requirement.direction === "above" ? value > requirement.value : value < requirement.value;

  return blocked ? { ok: false, message: requirement.message } : { ok: true };
}

function formatDelta(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function buildPetVitalsEffects(definition: PetVitalsActionDefinition): PetVitalsEffectPreview[] {
  const effects: PetVitalsEffectPreview[] = petVitalsStatKeys
    .filter((key) => definition.effects[key] !== 0)
    .map((key) => ({
      key,
      label: petVitalsStatLabels[key],
      delta: definition.effects[key],
    }));

  if (definition.points > 0) {
    effects.push({ key: "points", label: "羁绊", delta: definition.points });
  }

  return effects;
}

export function formatPetVitalsEffects(effects: PetVitalsEffectPreview[]): string {
  return effects.map((effect) => `${effect.label} ${formatDelta(effect.delta)}`).join(" · ");
}

export function getPetVitalsCooldownRemainingMs(state: PetVitalsState, action: PetVitalsActionId, nowMs: number) {
  const until = state.cooldownUntilMs?.[action];
  if (typeof until !== "number" || !Number.isFinite(until)) {
    return 0;
  }

  return Math.max(0, until - nowMs);
}

export function applyPetVitalsAction(
  state: PetVitalsState,
  action: PetVitalsActionId,
  nowMs: number,
  options: { rates?: PetVitalsDecayRates } = {},
): { state: PetVitalsState; result: Omit<PetVitalsActionResult, "snapshot"> } {
  const definition = petVitalsActionCatalog[action];
  const decayed = decayPetVitals(state, nowMs, options.rates ?? defaultPetVitalsDecayRates);
  const cooldownRemaining = getPetVitalsCooldownRemainingMs(decayed, action, nowMs);

  if (cooldownRemaining > 0) {
    return {
      state: decayed,
      result: {
        ok: false,
        action,
        reason: "cooldown",
        message: `${definition.label}还在冷却，${Math.ceil(cooldownRemaining / 1000)} 秒后再试`,
        reaction: definition.blockedReaction,
        reactionEmotion: definition.blockedEmotion,
        effects: [],
        cooldownUntilMs: decayed.cooldownUntilMs?.[action],
      },
    };
  }

  const check = checkPetVitalsAction(definition, decayed);
  if (!check.ok) {
    return {
      state: decayed,
      result: {
        ok: false,
        action,
        reason: "requirement",
        message: check.message,
        reaction: definition.blockedReaction,
        reactionEmotion: definition.blockedEmotion,
        effects: [],
      },
    };
  }

  const todayKey = dayKeyOf(nowMs);
  const bonus = decayed.lastBonusDayKey === todayKey ? 0 : dailyBonusPoints;
  const effects = buildPetVitalsEffects(definition);
  if (bonus > 0) {
    effects.push({ key: "points", label: "今日首次互动", delta: bonus });
  }

  const next: PetVitalsState = {
    affinity: clampStat(decayed.affinity + definition.effects.affinity),
    satiety: clampStat(decayed.satiety + definition.effects.satiety),
    mood: clampStat(decayed.mood + definition.effects.mood),
    points: clampPoints(decayed.points + definition.points + bonus),
    lastUpdatedMs: nowMs,
    lastInteractionAtMs: nowMs,
    lastBonusDayKey: todayKey,
    cooldownUntilMs: {
      ...decayed.cooldownUntilMs,
      [action]: nowMs + definition.cooldownMs,
    },
    totals: {
      ...decayed.totals,
      [action]: decayed.totals[action] + 1,
    },
  };

  return {
    state: next,
    result: {
      ok: true,
      action,
      message: `${definition.label}完成：${formatPetVitalsEffects(effects)}`,
      reaction: definition.reaction,
      reactionEmotion: definition.reactionEmotion,
      effects,
      cooldownUntilMs: next.cooldownUntilMs[action],
    },
  };
}

export function getPetVitalsWarnings(stats: Record<PetVitalsStatKey, number>): PetVitalsWarning[] {
  const warnings: PetVitalsWarning[] = [];

  if (stats.satiety < 25) {
    warnings.push({ kind: "hungry", message: "饱食度偏低，记得喂点东西" });
  }

  if (stats.mood < 25) {
    warnings.push({ kind: "bored", message: "心情有点低落，陪它玩一会儿吧" });
  }

  if (stats.affinity < 12) {
    warnings.push({ kind: "lonely", message: "好感度很低，多摸摸它吧" });
  }

  return warnings;
}

export function getPetVitalsMood(stats: Record<PetVitalsStatKey, number>): { key: PetVitalsMoodKey; label: string } {
  const overall = (stats.mood * 2 + stats.satiety + stats.affinity) / 4;

  if (stats.satiety < 20 || overall < 25) {
    return { key: "low", label: "有点难过" };
  }

  if (overall >= 82) {
    return { key: "delighted", label: "超开心" };
  }

  if (overall >= 58) {
    return { key: "happy", label: "心情不错" };
  }

  return { key: "neutral", label: "还算平静" };
}

export function getPetVitalsStatusLabel(stats: Record<PetVitalsStatKey, number>): string {
  if (stats.satiety < 20) {
    return "饿坏了";
  }

  if (stats.mood < 20) {
    return "闷闷不乐";
  }

  if (stats.affinity < 15) {
    return "还有点怕生";
  }

  if (stats.satiety >= 85 && stats.mood >= 80 && stats.affinity >= 60) {
    return "状态极佳";
  }

  return "元气满满";
}

export function createPetVitalsSnapshot(
  state: PetVitalsState,
  nowMs: number,
  options: PetVitalsOptions = {},
): PetVitalsSnapshot {
  const stats: Record<PetVitalsStatKey, number> = {
    affinity: state.affinity,
    satiety: state.satiety,
    mood: state.mood,
  };
  const bond = getPetBondLevel(state.points);
  const mood = getPetVitalsMood(stats);
  const cooldownUntilMs = {} as Record<PetVitalsActionId, number>;

  for (const actionId of petVitalsActionIds) {
    cooldownUntilMs[actionId] = state.cooldownUntilMs?.[actionId] ?? 0;
  }

  return {
    enabled: options.enabled ?? true,
    paused: !(options.enabled ?? true),
    stats,
    level: bond.level,
    levelTitle: bond.title,
    levelProgress: bond.progress,
    points: state.points,
    nextLevelPoints: bond.nextLevelPoints,
    moodKey: mood.key,
    moodLabel: mood.label,
    statusLabel: getPetVitalsStatusLabel(stats),
    warnings: getPetVitalsWarnings(stats),
    cooldownUntilMs,
    totals: state.totals,
    lastInteractionAtMs: state.lastInteractionAtMs,
    updatedAtMs: nowMs,
    hudMode: options.hudMode ?? "click",
  };
}

export function getPetVitalsNeedEvent(
  stats: Record<PetVitalsStatKey, number>,
  kind: PetVitalsNeedKind,
): PetVitalsNeedEvent | undefined {
  if (kind === "hungry" && stats.satiety < 20) {
    return { kind, message: "肚子咕咕叫了…可以喂我一点东西吗？", emotion: "sleepy" };
  }

  if (kind === "bored" && stats.mood < 20) {
    return { kind, message: "有点无聊，陪我玩一会儿好不好？", emotion: "attentive" };
  }

  if (kind === "lonely" && stats.affinity < 10) {
    return { kind, message: "好久没理我了…摸摸我好吗？", emotion: "waiting" };
  }

  return undefined;
}

/** True once the stat recovered enough that the warning can fire again later. */
export function isPetVitalsNeedCleared(stats: Record<PetVitalsStatKey, number>, kind: PetVitalsNeedKind): boolean {
  if (kind === "hungry") {
    return stats.satiety >= 35;
  }

  if (kind === "bored") {
    return stats.mood >= 35;
  }

  return stats.affinity >= 20;
}

/**
 * The status card is its own transparent window, so both the main process and
 * the renderer have to agree on its size.
 */
export const petVitalsPanelSizes = {
  compact: { width: 240, height: 162 },
  expanded: { width: 272, height: 356 },
} as const;

export function getPetVitalsPanelSize(expanded: boolean) {
  return expanded ? petVitalsPanelSizes.expanded : petVitalsPanelSizes.compact;
}

/**
 * Keeps a dragged card fully inside the display work area, so it can never be
 * dropped off-screen or under the taskbar.
 */
export function clampPetVitalsHudPosition(
  position: PetVitalsHudPosition,
  size: { width: number; height: number },
  workArea: { x: number; y: number; width: number; height: number },
  margin = 8,
): PetVitalsHudPosition {
  const maxX = workArea.x + workArea.width - size.width - margin;
  const maxY = workArea.y + workArea.height - size.height - margin;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;

  return {
    x: Math.round(Math.min(Math.max(position.x, Math.min(minX, maxX)), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(position.y, Math.min(minY, maxY)), Math.max(minY, maxY))),
  };
}

/** Which side of the pet the card sits on, used to pick the tail edge. */
export function getPetVitalsHudPlacement(
  cardCenterX: number,
  petCenterX: number,
): PetVitalsStatusPlacement {
  return cardCenterX < petCenterX ? "left" : "right";
}

/** Vertical position of the tail so it keeps pointing at the pet. */
export function getPetVitalsTailOffset(
  cardBounds: { y: number; height: number },
  petBounds: { y: number; height: number },
  margin = 18,
): number {
  const petCenterY = petBounds.y + petBounds.height / 2;
  const maxOffset = Math.max(margin, cardBounds.height - margin);

  return Math.round(Math.min(Math.max(petCenterY - cardBounds.y, Math.min(margin, maxOffset)), maxOffset));
}