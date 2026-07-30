import type { PetBubble, PetEmotion } from "../../shared/petBehavior";
import "./PetApp.css";

const petEmotions: PetEmotion[] = ["attentive", "thinking", "happy", "sleepy", "waving", "jumping", "failed", "waiting", "running", "review"];

function readBubbleFromQuery(): PetBubble | undefined {
  const params = new URLSearchParams(window.location.search);
  const text = params.get("text");
  const emotion = params.get("emotion");

  if (!text) {
    return undefined;
  }

  const topicId = params.get("topicId");
  const actionLabel = params.get("actionLabel") ?? undefined;

  return {
    text,
    emotion: petEmotions.includes(emotion as PetEmotion) ? emotion as PetEmotion : "happy",
    actionLabel,
    action: topicId ? { type: "chat.replyToTopic", topicId } : undefined,
  };
}

export function PetBubbleLayer() {
  const bubble = readBubbleFromQuery();

  if (!bubble) {
    return null;
  }

  return (
    <main className="pet-bubble-layer">
      <div className={`pet-bubble pet-bubble--${bubble.emotion}`} role="status" aria-live="polite">
        <span className="pet-bubble__text">{bubble.text}</span>
        {bubble.action && bubble.actionLabel && (
          <button
            type="button"
            className="pet-bubble__reply"
            onClick={() => {
              void window.petdex?.chat?.replyToProactiveTopic(bubble.action?.topicId ?? "");
            }}
          >
            {bubble.actionLabel}
          </button>
        )}
      </div>
    </main>
  );
}
