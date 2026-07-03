import type { ChatProactiveTopic } from "../../plugins/chat/types.js";

export interface ProactiveTopicReplyHandlerOptions {
  topics: Map<string, ChatProactiveTopic>;
  openChat(): void;
}

export function createProactiveTopicReplyHandler(options: ProactiveTopicReplyHandlerOptions) {
  return (topicId: string) => {
    const topic = options.topics.get(topicId);
    options.openChat();

    if (topic) {
      options.topics.delete(topic.id);
    }
  };
}