# Pet Chat Personality, Memory, History, and Proactive Topics Design

## Goal

Improve the pet chat experience with configurable pet personality, custom prompts, multiple personality and prompt templates, persistent chat history, editable pet memory, a clear chat history action, and proactive topic bubbles that can open the chat window for a reply.

## Scope

This feature extends the existing Electron pet app. It updates the chat plugin, settings app, pet renderer, model prompt assembly, preload API, IPC registration, and local services. It does not change provider authentication, translator behavior, screenshot behavior, OCR behavior, or the pet sprite assets.

## Existing Context

- `src/plugins/chat/renderer/ChatPanel.tsx` keeps messages only in React state and calls `window.petdex.model.chat`.
- `src/main/services/modelService.ts` has a fixed chat system prompt.
- `src/renderer/shell/SettingsApp.tsx` has a chat settings section, but it only says the chat plugin uses the model page connection settings.
- `src/renderer/shell/PetApp.tsx` already renders pet bubbles sent by the main process, but bubbles are text-only and cannot carry an action button.
- `src/shared/configSchema.ts` has no `chat` section.
- `src/preload/api.ts`, `src/preload/index.ts`, and `src/main/ipc/registerCoreIpc.ts` expose model and pet APIs, but not chat history or memory APIs.

## User Experience

### Chat Settings

The settings app gets a complete "聊天" section:

- Personality template selector.
- Prompt template selector.
- Custom prompt textarea.
- Editable long-term memory textarea.
- Recent history limit input.
- Toggles for memory and proactive topics.
- Proactive topic interval inputs.
- Button to clear chat history.
- Button to clear long-term memory.

The personality selector applies a bundled personality template. The prompt selector applies a bundled prompt template. The custom prompt remains editable after applying a template.

### Templates

Ship at least four personality templates:

- Warm companion: gentle, encouraging, concise.
- Playful tomato: lively, light humor, still helpful.
- Focus coach: helps users plan, stay on task, and break work down.
- Quiet listener: calm, low-energy, emotionally steady.

Ship at least four prompt templates:

- Daily companion: casual check-ins and short replies.
- Work buddy: productivity-oriented suggestions.
- Emotional support: validating and careful, without pretending to provide medical advice.
- Study partner: asks guiding questions and explains things simply.

### Chat Window

The chat window loads persisted history on open. It sends the current user message through a main-process chat API, then renders and persists the assistant reply. The displayed messages include prior local history, capped by settings.

### Memory

Memory uses both recent chat history and editable long-term memory:

- Recent history is stored as message records and used as short-term context.
- Long-term memory is stored as editable text and included in the system prompt when enabled.
- After successful chat replies, the main process updates long-term memory only when memory is enabled and the latest user message contains a stable preference, name, recurring context, or explicit plan.
- Clearing chat history does not clear long-term memory.
- Clearing long-term memory does not clear chat history.

### Proactive Topics

When proactive topics are enabled, the main process schedules a random topic after a random delay within the configured interval. The pet shows a bubble with short text and a "回复" button. Clicking "回复" opens the chat window with the topic available as the initial conversation context or draft.

Proactive topics are local, lightweight, and reliable in the first implementation. They use bundled topic strings and do not call the model.

## Architecture

### Configuration

Add `chat` to `AppConfig`:

- `personalityId: string`
- `promptTemplateId: string`
- `customPrompt: string`
- `historyLimit: number`
- `memoryEnabled: boolean`
- `proactiveTopicsEnabled: boolean`
- `proactiveTopicMinMinutes: number`
- `proactiveTopicMaxMinutes: number`

Defaults:

- Personality: warm companion.
- Prompt template: daily companion.
- Custom prompt: empty by default. The effective prompt is `customPrompt.trim()` when present, otherwise the selected prompt template body.
- History limit: 30 messages.
- Memory enabled: true.
- Proactive topics enabled: true.
- Interval: 20 to 60 minutes.

The config service must merge persisted configs with the new defaults so old installs receive the new chat fields.

### Shared Chat Types and Templates

Extend `src/plugins/chat/types.ts` with:

- `ChatMessage` carrying `role` and `content` for model-compatible messages.
- `ChatHistoryEntry` carrying `id`, `role`, `content`, and `createdAt` for persisted records.
- `ChatMemoryState` with `summary` and `updatedAt`.
- `ChatSendRequest` for renderer-to-main sends.
- `ChatSendResult` with assistant message, history, and memory.
- `ChatProactiveTopic` with `id`, `text`, and `draft`.

Add a shared template module so settings, main, and tests use the same template ids and labels.

### Chat State Service

Create a main-process chat state service responsible for local persistence:

- Save chat history to `chat-history.json` under `userDataPath`.
- Save long-term memory to `chat-memory.json` under `userDataPath`.
- Read, append, list, and clear history.
- Read and set memory.
- Cap saved history by configured `historyLimit`.
- Tolerate missing or invalid files by falling back to empty state and rewriting valid JSON.

This service owns file IO. Renderer code accesses it only through preload IPC.

### Model Prompt Assembly

Move pet chat prompt assembly out of the renderer. Main process should call `modelService.chat` with:

- Selected personality template.
- Selected prompt template or custom prompt.
- Long-term memory if enabled and non-empty.
- Recent history capped by settings.
- Current user message.

`modelService.chat` accepts a `systemContext` object for prompt components instead of using only the current fixed prompt. It still keeps the base safety and identity instructions:

- The assistant is LacriTomato Mini desktop pet.
- Replies are natural, short, and companionable.
- The assistant must not claim it can see the user's screen.
- For app actions, it should guide users to the pet menu or settings page.

### Memory Update

After a successful assistant reply, update memory only when memory is enabled. The first implementation uses a deterministic local memory update strategy and does not make a second model call.

Append concise facts only when the user explicitly states preferences, names, recurring context, or stable plans. If no stable fact is detected, leave memory unchanged. This keeps the feature fast and reduces provider calls.

### IPC and Preload

Add chat-specific channels:

- `chat:history:list`
- `chat:history:clear`
- `chat:memory:get`
- `chat:memory:set`
- `chat:memory:clear`
- `chat:send`
- `chat:proactive-topic:reply`

Expose them as `window.petdex.chat`.

Keep `window.petdex.model.chat` for the existing preload contract, and migrate `ChatPanel` to `window.petdex.chat.send`.

### Pet Bubble Action

Extend pet bubble payloads from plain strings to a structured payload:

- Existing string bubbles remain supported.
- Structured bubbles can include `text`, `emotion`, `actionLabel`, and `action`.
- For proactive topics, action is `chat.replyToTopic`.

`PetApp` renders the action button inside the bubble when present. The button calls a preload pet/chat API to notify main, and main opens the chat window.

### Proactive Topic Scheduler

The scheduler lives in the main process, close to `app.ts`, because it needs config, chat window creation, and pet bubble access.

Behavior:

- Start when the app is ready and proactive topics are enabled.
- Reschedule after every topic and after config changes.
- Use a random delay between min and max minutes.
- Do not show proactive topics when disabled.
- If min is greater than max, normalize to the default interval.
- Use bundled topics such as short check-ins, work breaks, hydration reminders, or playful conversation openers.

### Error Handling

- If chat state files are unreadable or malformed, recover with empty history or memory.
- If model chat fails, keep the user message visible in the renderer but do not append a fake assistant reply.
- If memory update fails, keep the chat reply successful and surface a non-blocking notice only if useful.
- If proactive topic reply fails to open the chat window, keep the pet usable and log the error.
- If preload API is unavailable, chat and settings show the existing disconnected message pattern.

## Testing

Add or update unit and renderer tests:

- Config schema accepts new `chat` defaults.
- Config service merges old configs with chat defaults.
- Chat state service persists, caps, clears, and recovers from bad JSON.
- Model service builds chat requests with custom system prompt components.
- Core IPC exposes chat send, history, and memory operations.
- ChatPanel loads persisted history and sends through `petdex.chat.send`.
- SettingsApp renders chat settings, applies templates, saves config, edits memory, and clears history.
- PetApp renders a structured proactive bubble with a reply button.
- Proactive topic scheduler respects enabled state and interval bounds.

## Non-Goals

- No cloud sync for history or memory.
- No multi-user profiles.
- No vector database or semantic retrieval.
- No model-generated proactive topics in the first implementation.
- No redesign of the entire settings app layout.

## Acceptance Criteria

- Users can select a pet personality and prompt template in settings.
- Users can customize the prompt text and save it.
- Users can chat, close the chat window, reopen it, and see persisted recent history.
- Users can clear chat history from settings.
- Users can view, edit, and clear long-term pet memory independently of history.
- Model chat receives personality, custom prompt, memory, and recent history context.
- When enabled, the pet periodically shows a proactive topic bubble with a reply button.
- Clicking the proactive reply button opens the chat window with that topic available to respond to.
- Existing translator, screenshot, and basic pet menu behaviors continue to work.

