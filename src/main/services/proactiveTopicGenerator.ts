import type { ChatMessage, ChatProactiveTopic, ChatSystemContext } from "../../plugins/chat/types.js";
import { findChatPersonalityTemplate, findChatPromptTemplate } from "../../plugins/chat/templates.js";
import type { AppConfig } from "../../shared/configSchema.js";
import type { ModelProviderConfig, ModelService } from "./modelService.js";

export interface GenerateProactiveTopicOptions {
  modelService: ModelService;
  providerConfig: ModelProviderConfig;
  appConfig: AppConfig;
  memorySummary: string;
  recentHistory?: ChatMessage[];
  now?: () => number;
  random?: () => number;
}

function buildProactiveSystemContext(config: AppConfig, memorySummary: string): ChatSystemContext {
  const customPrompt = config.chat.customPrompt.trim();
  const memory = config.chat.memoryEnabled && memorySummary.trim() ? memorySummary : undefined;

  if (customPrompt) {
    return {
      behaviorPrompt: customPrompt,
      memorySummary: memory,
    };
  }

  const personality = findChatPersonalityTemplate(config.chat.personalityId);
  const promptTemplate = findChatPromptTemplate(config.chat.promptTemplateId);

  return {
    personalityPrompt: personality.prompt,
    behaviorPrompt: promptTemplate.prompt,
    memorySummary: memory,
  };
}

function readProactiveSpeech(content: string) {
  return content.trim().replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/g, "");
}

function normalizeSpeech(content: string) {
  return readProactiveSpeech(content)
    .replace(/\s+/g, "")
    .replace(/[，。！？!?,.~～、…]+$/g, "");
}

function recentHistoryLines(history: ChatMessage[] | undefined) {
  return (history ?? [])
    .slice(-12)
    .map((message) => readProactiveSpeech(message.content))
    .filter(Boolean)
    .map((content, index) => `${index + 1}. ${content}`);
}

function recentAssistantSpeechSet(history: ChatMessage[] | undefined) {
  return new Set((history ?? [])
    .filter((message) => message.role === "assistant")
    .map((message) => normalizeSpeech(message.content))
    .filter(Boolean));
}

function buildProactivePrompt(options: {
  recentHistory?: ChatMessage[];
  seed: string;
  repeatedText?: string;
}) {
  const historyLines = recentHistoryLines(options.recentHistory);
  return [
    "请代表桌面宠物主动发起一个自然、简短的话题。",
    "只输出宠物要在气泡里说的话，不要解释，不要加前缀。",
    "语气要符合当前宠物提示词和长期记忆；不要假装看到了用户屏幕。",
    "控制在 35 个中文字符以内，适合用户点击回复继续聊天。",
    "不要重复最近说过的话、问题类型或开场句式；尤其不要连续询问心情。",
    `变化种子：${options.seed}`,
    historyLines.length > 0
      ? ["最近已经说过/聊过的内容，请不要重复这些句子或换皮复述：", ...historyLines].join("\n")
      : undefined,
    options.repeatedText ? `刚才生成的内容重复了：${options.repeatedText}。请换一个完全不同的话题。` : undefined,
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0).join("\n");
}

async function requestProactiveSpeech(options: GenerateProactiveTopicOptions, prompt: string) {
  const message: ChatMessage = {
    role: "user",
    content: prompt,
  };

  const result = await options.modelService.chat({
    messages: [message],
    systemContext: buildProactiveSystemContext(options.appConfig, options.memorySummary),
  }, {
    ...options.providerConfig,
    temperature: Math.max(options.providerConfig.temperature, 0.75),
  });

  const text = readProactiveSpeech(result.message.content);
  if (!text) {
    throw new Error("模型没有生成主动话题内容");
  }

  return text;
}

export async function generateProactiveTopic(options: GenerateProactiveTopicOptions): Promise<ChatProactiveTopic> {
  const now = options.now?.() ?? Date.now();
  const random = options.random ?? Math.random;
  const seed = `${now}-${Math.floor(random() * 1000)}`;
  const recentAssistant = recentAssistantSpeechSet(options.recentHistory);
  let text = await requestProactiveSpeech(options, buildProactivePrompt({
    recentHistory: options.recentHistory,
    seed,
  }));

  if (recentAssistant.has(normalizeSpeech(text))) {
    text = await requestProactiveSpeech(options, buildProactivePrompt({
      recentHistory: options.recentHistory,
      seed,
      repeatedText: text,
    }));
  }

  return {
    id: `model-${now}`,
    text,
    draft: `想回复：${text}`,
  };
}