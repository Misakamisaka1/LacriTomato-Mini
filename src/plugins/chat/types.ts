export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatHistoryEntry extends ChatMessage {
  id: string;
  createdAt: string;
}

export interface ChatMemoryState {
  summary: string;
  updatedAt?: string;
}

export interface ChatSystemContext {
  personalityPrompt?: string;
  behaviorPrompt?: string;
  customPrompt?: string;
  memorySummary?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemContext?: ChatSystemContext;
}

export interface ChatSendRequest {
  content: string;
  proactiveTopicId?: string;
}

export interface ChatSendResult {
  message: ChatMessage;
  history: ChatHistoryEntry[];
  memory: ChatMemoryState;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  raw?: string;
}

export interface ChatResult {
  message: ChatMessage;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  raw?: string;
}

export interface ChatProactiveTopic {
  id: string;
  text: string;
  draft: string;
}
