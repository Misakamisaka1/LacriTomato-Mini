export type PetEmotion = "attentive" | "thinking" | "happy" | "sleepy";
export type PetMode = "idle" | "wandering" | PetEmotion;
export type PetAnimationName = "idle" | "walkRight" | "walkLeft" | PetEmotion;

export interface PetBubbleAction {
  type: "chat.replyToTopic";
  topicId: string;
}

export interface PetBubble {
  text: string;
  emotion: PetEmotion;
  actionLabel?: string;
  action?: PetBubbleAction;
}

export interface PetMovement {
  deltaX: number;
  deltaY: number;
}

export interface PetEmotionPayload {
  emotion: PetEmotion;
  bubbleText?: string;
  durationMs?: number;
}

export interface PetBehaviorState {
  mode: PetMode;
  animation: PetAnimationName;
  bubble?: PetBubble;
  bubbleUntilMs?: number;
  emotionUntilMs?: number;
  nextWanderAtMs: number;
  wanderUntilMs?: number;
  wanderDirection: 1 | -1;
  activeWanderDirection?: 1 | -1;
  movement?: PetMovement;
}

export type PetBehaviorEvent =
  | {
      type: "tick";
      now: number;
      paused: boolean;
      wanderEnabled: boolean;
    }
  | {
      type: "emotion";
      now: number;
      emotion: PetEmotion;
      bubbleText?: string;
      durationMs?: number;
    }
  | {
      type: "bubble";
      now: number;
      text: string;
      emotion?: PetEmotion;
      durationMs?: number;
      actionLabel?: string;
      action?: PetBubbleAction;
    };

const wanderDelayMs = 2400;
const wanderDurationMs = 1400;
const wanderStepPx = 10;
const defaultEmotionDurationMs = 2200;
const defaultBubbleDurationMs = 3200;

export function createInitialPetBehavior(now = 0): PetBehaviorState {
  return {
    mode: "idle",
    animation: "idle",
    nextWanderAtMs: now + wanderDelayMs,
    wanderDirection: 1,
  };
}

function withoutMovement(state: PetBehaviorState): PetBehaviorState {
  if (!state.movement) {
    return state;
  }

  const { movement: _movement, ...rest } = state;
  return rest;
}

function clearWander(state: PetBehaviorState): PetBehaviorState {
  return {
    ...state,
    wanderUntilMs: undefined,
    activeWanderDirection: undefined,
  };
}

function expireTransientState(state: PetBehaviorState, now: number): PetBehaviorState {
  let next = withoutMovement(state);

  if (next.bubbleUntilMs !== undefined && now >= next.bubbleUntilMs) {
    const { bubble: _bubble, bubbleUntilMs: _bubbleUntilMs, ...rest } = next;
    next = rest;
  }

  if (next.emotionUntilMs !== undefined && now >= next.emotionUntilMs) {
    const { emotionUntilMs: _emotionUntilMs, ...rest } = next;
    next = {
      ...clearWander(rest),
      mode: "idle",
      animation: "idle",
    };
  }

  return next;
}

function isEmotionLocked(state: PetBehaviorState, now: number) {
  return state.emotionUntilMs !== undefined && now < state.emotionUntilMs;
}

function idleAfterPause(state: PetBehaviorState, now: number): PetBehaviorState {
  if (state.mode !== "wandering") {
    return withoutMovement(state);
  }

  return {
    ...clearWander(withoutMovement(state)),
    mode: "idle",
    animation: "idle",
    nextWanderAtMs: now + wanderDelayMs,
  };
}

function animationForDirection(direction: 1 | -1): PetAnimationName {
  return direction > 0 ? "walkRight" : "walkLeft";
}

export function reducePetBehavior(state: PetBehaviorState, event: PetBehaviorEvent): PetBehaviorState {
  if (event.type === "emotion") {
    const durationMs = event.durationMs ?? defaultEmotionDurationMs;
    return {
      ...clearWander(withoutMovement(state)),
      mode: event.emotion,
      animation: event.emotion,
      bubble: event.bubbleText
        ? state.bubble?.text === event.bubbleText
          ? { ...state.bubble, emotion: event.emotion }
          : { text: event.bubbleText, emotion: event.emotion }
        : state.bubble,
      bubbleUntilMs: event.bubbleText ? event.now + durationMs : state.bubbleUntilMs,
      emotionUntilMs: event.now + durationMs,
    };
  }

  if (event.type === "bubble") {
    const emotion = event.emotion ?? "happy";
    return {
      ...clearWander(withoutMovement(state)),
      mode: emotion,
      animation: emotion,
      bubble: { text: event.text, emotion, actionLabel: event.actionLabel, action: event.action },
      bubbleUntilMs: event.now + (event.durationMs ?? defaultBubbleDurationMs),
      emotionUntilMs: event.now + (event.durationMs ?? defaultEmotionDurationMs),
    };
  }

  let next = expireTransientState(state, event.now);

  if (isEmotionLocked(next, event.now)) {
    return withoutMovement(next);
  }

  if (event.paused || !event.wanderEnabled) {
    return idleAfterPause(next, event.now);
  }

  if (next.wanderUntilMs !== undefined && event.now < next.wanderUntilMs) {
    const direction = next.activeWanderDirection ?? next.wanderDirection;
    return {
      ...next,
      mode: "wandering",
      animation: animationForDirection(direction),
      movement: { deltaX: direction * wanderStepPx, deltaY: 0 },
    };
  }

  if (event.now >= next.nextWanderAtMs) {
    const direction = next.wanderDirection;
    return {
      ...next,
      mode: "wandering",
      animation: animationForDirection(direction),
      movement: { deltaX: direction * wanderStepPx, deltaY: 0 },
      wanderUntilMs: event.now + wanderDurationMs,
      activeWanderDirection: direction,
      nextWanderAtMs: event.now + wanderDurationMs + wanderDelayMs,
      wanderDirection: direction === 1 ? -1 : 1,
    };
  }

  return {
    ...clearWander(withoutMovement(next)),
    mode: "idle",
    animation: "idle",
  };
}

