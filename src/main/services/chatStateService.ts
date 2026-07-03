import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatHistoryEntry, ChatMemoryState, ChatMessage } from "../../plugins/chat/types.js";

export interface ChatStateServiceOptions {
  userDataPath: string;
  createId?: () => string;
  now?: () => string;
}

export interface ChatStateService {
  listHistory(limit?: number): ChatHistoryEntry[];
  appendMessages(messages: ChatMessage[], limit: number): ChatHistoryEntry[];
  clearHistory(): ChatHistoryEntry[];
  getMemory(): ChatMemoryState;
  setMemory(summary: string): ChatMemoryState;
  clearMemory(): ChatMemoryState;
  updateMemoryFromUserMessage(content: string, enabled: boolean): ChatMemoryState;
}

function defaultCreateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultNow() {
  return new Date().toISOString();
}

function readJsonFile<T>(path: string, fallback: T, isValid: (value: unknown) => value is T): { value: T; recovered: boolean } {
  if (!existsSync(path)) {
    return { value: fallback, recovered: true };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (isValid(parsed)) {
      return { value: parsed, recovered: false };
    }
  } catch {
    // Fall through to recovery write below.
  }

  return { value: fallback, recovered: true };
}

function writeJsonFile(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function isRole(value: unknown): value is ChatMessage["role"] {
  return value === "user" || value === "assistant";
}

function isHistoryEntry(value: unknown): value is ChatHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ChatHistoryEntry>;
  return typeof entry.id === "string"
    && isRole(entry.role)
    && typeof entry.content === "string"
    && typeof entry.createdAt === "string";
}

function isHistory(value: unknown): value is ChatHistoryEntry[] {
  return Array.isArray(value) && value.every(isHistoryEntry);
}

function isMemory(value: unknown): value is ChatMemoryState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const memory = value as Partial<ChatMemoryState>;
  return typeof memory.summary === "string"
    && (memory.updatedAt === undefined || typeof memory.updatedAt === "string");
}

function capHistory(history: ChatHistoryEntry[], limit: number) {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) {
    return [];
  }

  return history.slice(-safeLimit);
}

function hasStableMemoryFact(content: string) {
  return ["我叫", "我是", "我喜欢", "喜欢", "偏好", "记住", "我希望", "计划", "每天", "经常"].some((keyword) => content.includes(keyword));
}

export function createChatStateService(options: ChatStateServiceOptions): ChatStateService {
  mkdirSync(options.userDataPath, { recursive: true });

  const historyPath = join(options.userDataPath, "chat-history.json");
  const memoryPath = join(options.userDataPath, "chat-memory.json");
  const createId = options.createId ?? defaultCreateId;
  const now = options.now ?? defaultNow;

  const loadedHistory = readJsonFile(historyPath, [] as ChatHistoryEntry[], isHistory);
  const loadedMemory = readJsonFile(memoryPath, { summary: "" } as ChatMemoryState, isMemory);
  let history = loadedHistory.value;
  let memory = loadedMemory.value;

  if (loadedHistory.recovered) {
    writeJsonFile(historyPath, history);
  }
  if (loadedMemory.recovered) {
    writeJsonFile(memoryPath, memory);
  }

  function saveHistory(nextHistory: ChatHistoryEntry[]) {
    history = nextHistory;
    writeJsonFile(historyPath, history);
    return listHistory();
  }

  function saveMemory(nextMemory: ChatMemoryState) {
    memory = nextMemory;
    writeJsonFile(memoryPath, memory);
    return getMemory();
  }

  function listHistory(limit?: number) {
    const visible = typeof limit === "number" ? capHistory(history, limit) : history;
    return visible.map((entry) => ({ ...entry }));
  }

  function getMemory() {
    return { ...memory };
  }

  return {
    listHistory,
    appendMessages(messages, limit) {
      const entries = messages.map((message) => ({
        id: createId(),
        role: message.role,
        content: message.content,
        createdAt: now(),
      }));
      return saveHistory(capHistory([...history, ...entries], limit));
    },
    clearHistory() {
      return saveHistory([]);
    },
    getMemory,
    setMemory(summary) {
      return saveMemory({ summary, updatedAt: now() });
    },
    clearMemory() {
      return saveMemory({ summary: "", updatedAt: now() });
    },
    updateMemoryFromUserMessage(content, enabled) {
      const stableContent = content.trim();
      if (!enabled || !stableContent || !hasStableMemoryFact(stableContent)) {
        return getMemory();
      }

      const lines = memory.summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.includes(stableContent)) {
        return getMemory();
      }

      return saveMemory({
        summary: [...lines, stableContent].join("\n"),
        updatedAt: now(),
      });
    },
  };
}
