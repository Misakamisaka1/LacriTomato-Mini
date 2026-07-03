import type { ChatProactiveTopic } from "../../plugins/chat/types.js";
import type { AppConfig } from "../../shared/configSchema.js";

export interface ProactiveTopicService {
  start(): void;
  stop(): void;
  reschedule(): void;
}

type TimerHandle = ReturnType<typeof setTimeout> | number;

export interface ProactiveTopicServiceOptions {
  getConfig(): AppConfig;
  showTopic(topic: ChatProactiveTopic): void;
  recordTopic?: (topic: ChatProactiveTopic) => void;
  generateTopic?: () => Promise<ChatProactiveTopic>;
  random?: () => number;
  setTimer?: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  topics?: ChatProactiveTopic[];
}

const defaultMinMinutes = 20;
const defaultMaxMinutes = 60;

export const defaultProactiveTopics: ChatProactiveTopic[] = [
  { id: "check-in", text: "要不要聊聊现在在忙什么？", draft: "想聊聊我现在在忙的事。" },
  { id: "next-step", text: "我可以陪你想一下下一步。", draft: "帮我想一下下一步。" },
  { id: "small-break", text: "要不要休息一分钟，顺便和我说句话？", draft: "我想休息一下。" },
  { id: "daily-plan", text: "今天有什么想推进的小目标吗？", draft: "想聊聊今天的小目标。" },
];

function normalizeInterval(config: AppConfig["chat"]) {
  const min = Math.floor(config.proactiveTopicMinMinutes);
  const max = Math.floor(config.proactiveTopicMaxMinutes);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < 1 || min > max) {
    return { min: defaultMinMinutes, max: defaultMaxMinutes };
  }

  return { min, max };
}

export function createProactiveTopicService(options: ProactiveTopicServiceOptions): ProactiveTopicService {
  const random = options.random ?? Math.random;
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const topics = options.topics?.length ? options.topics : defaultProactiveTopics;
  let timer: TimerHandle | undefined;

  function stop() {
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
  }

  function pickTopic() {
    const index = Math.min(topics.length - 1, Math.floor(random() * topics.length));
    return topics[index];
  }

  function schedule() {
    stop();
    const config = options.getConfig().chat;
    if (!config.proactiveTopicsEnabled) {
      return;
    }

    const interval = normalizeInterval(config);
    const minutes = interval.min + (interval.max - interval.min) * random();
    timer = setTimer(async () => {
      let topic: ChatProactiveTopic;
      try {
        topic = options.generateTopic ? await options.generateTopic() : pickTopic();
      } catch {
        topic = pickTopic();
      }
      try {
        options.recordTopic?.(topic);
      } catch {
        // A history write failure should not prevent the pet from showing the topic.
      }
      options.showTopic(topic);
      schedule();
    }, Math.round(minutes * 60 * 1000));
  }

  return {
    start: schedule,
    stop,
    reschedule: schedule,
  };
}
