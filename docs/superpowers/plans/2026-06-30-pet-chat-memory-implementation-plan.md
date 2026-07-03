# Pet Chat Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pet chat personality templates, custom prompts, persistent history, editable memory, history clearing, and proactive replyable pet topics.

**Architecture:** Add chat configuration and shared template/type modules, then route chat through a main-process chat state service and chat IPC. Renderer windows use preload APIs only: SettingsApp edits config/memory/history, ChatPanel sends through `petdex.chat`, and PetApp renders structured bubbles with reply actions.

**Tech Stack:** Electron main/preload IPC, React 19 renderer, TypeScript, Zod config schema, Vitest and Testing Library.

---

## File Structure

- Modify `src/shared/configSchema.ts`: add `chat` config schema and defaults.
- Create `src/plugins/chat/templates.ts`: define personality templates, prompt templates, and default ids.
- Modify `src/plugins/chat/types.ts`: add history, memory, send, system context, and proactive topic types.
- Create `src/main/services/chatStateService.ts`: persist chat history and memory in user data JSON files.
- Create `src/main/services/proactiveTopicService.ts`: schedule local proactive topic bubbles.
- Modify `src/main/services/modelService.ts`: accept chat system context and build prompt from templates, custom prompt, memory, and history.
- Modify `src/shared/ipcChannels.ts`: add chat and structured pet bubble channels.
- Modify `src/preload/api.ts` and `src/preload/index.ts`: expose `window.petdex.chat` and structured pet bubble APIs.
- Modify `src/main/ipc/registerCoreIpc.ts`: register chat send/history/memory/proactive-topic handlers.
- Modify `src/main/app.ts`: create chat state/proactive services, open chat with initial topic, and emit structured bubbles.
- Modify `src/plugins/chat/renderer/ChatPanel.tsx` and `.css`: load persisted history and send through chat API.
- Modify `src/renderer/shell/SettingsApp.tsx` and `.css`: add full chat settings UI.
- Modify `src/renderer/shell/PetApp.tsx` and `.css`: render replyable proactive bubbles.
- Update tests under `tests/unit` and `tests/renderer`.

### Task 1: Chat Config and Templates

**Files:**
- Modify: `src/shared/configSchema.ts`
- Create: `src/plugins/chat/templates.ts`
- Modify: `src/plugins/chat/types.ts`
- Test: `tests/unit/configSchema.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that `defaultAppConfig.chat` exists with `warm-companion`, `daily-companion`, history limit `30`, memory enabled, and proactive topics enabled.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/configSchema.test.ts`
Expected: FAIL because `defaultAppConfig.chat` is undefined.

- [ ] **Step 3: Implement config and templates**

Add `chat` to the Zod schema/defaults and create exported template arrays with four personality templates and four prompt templates.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/configSchema.test.ts`
Expected: PASS.

### Task 2: Chat State Persistence

**Files:**
- Create: `src/main/services/chatStateService.ts`
- Test: `tests/unit/chatStateService.test.ts`

- [ ] **Step 1: Write failing tests**

Cover list/append/cap history, clear history, get/set/clear memory, and invalid JSON recovery.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/chatStateService.test.ts`
Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement service**

Use `existsSync`, `mkdirSync`, `readFileSync`, and `writeFileSync`. Store `chat-history.json` and `chat-memory.json` under `userDataPath`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/chatStateService.test.ts`
Expected: PASS.

### Task 3: Model Chat System Context

**Files:**
- Modify: `src/main/services/modelService.ts`
- Modify: `src/plugins/chat/types.ts`
- Test: `tests/unit/modelService.test.ts`

- [ ] **Step 1: Write failing tests**

Assert the chat completion body includes base pet identity, selected personality text, effective prompt, long-term memory, and current user message.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/modelService.test.ts`
Expected: FAIL because `systemContext` is not used.

- [ ] **Step 3: Implement prompt assembly**

Add optional `systemContext` to chat requests and merge it with the existing base prompt.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/modelService.test.ts`
Expected: PASS.

### Task 4: Chat IPC and Preload API

**Files:**
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/registerCoreIpc.ts`
- Test: `tests/unit/registerCoreIpc.chat.test.ts`

- [ ] **Step 1: Write failing tests**

Mock `ipcMain.handle` and assert chat history, memory, send, and proactive reply channels are registered.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/registerCoreIpc.chat.test.ts`
Expected: FAIL because chat channels are missing.

- [ ] **Step 3: Implement IPC**

Expose `window.petdex.chat.listHistory`, `send`, `clearHistory`, `getMemory`, `setMemory`, `clearMemory`, and `replyToProactiveTopic`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/registerCoreIpc.chat.test.ts`
Expected: PASS.

### Task 5: ChatPanel Persistence Flow

**Files:**
- Modify: `src/plugins/chat/renderer/ChatPanel.tsx`
- Modify: `src/plugins/chat/renderer/ChatPanel.css`
- Test: `tests/renderer/ChatPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Assert the panel loads history from `petdex.chat.listHistory`, sends through `petdex.chat.send`, renders returned history/reply, and keeps the close button working.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/renderer/ChatPanel.test.tsx`
Expected: FAIL because `ChatPanel` still uses `petdex.model.chat`.

- [ ] **Step 3: Implement renderer**

Load persisted history on mount, keep optimistic user message display, call `chat.send`, and replace messages with returned history.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/renderer/ChatPanel.test.tsx`
Expected: PASS.

### Task 6: Settings Chat UI

**Files:**
- Modify: `src/renderer/shell/SettingsApp.tsx`
- Modify: `src/renderer/shell/SettingsApp.css`
- Test: `tests/renderer/SettingsApp.test.tsx`

- [ ] **Step 1: Write failing tests**

Assert chat settings render template selects, custom prompt textarea, memory textarea, proactive controls, and clear buttons.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/renderer/SettingsApp.test.tsx`
Expected: FAIL because the chat section is still a note.

- [ ] **Step 3: Implement UI**

Use existing settings form patterns and call `petdex.chat` memory/history APIs. Keep config save through `petdex.config.set`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/renderer/SettingsApp.test.tsx`
Expected: PASS.

### Task 7: Pet Replyable Bubbles and Proactive Scheduler

**Files:**
- Modify: `src/renderer/shell/PetApp.tsx`
- Modify: `src/renderer/shell/PetApp.css`
- Create: `src/main/services/proactiveTopicService.ts`
- Modify: `src/main/app.ts`
- Test: `tests/renderer/PetApp.test.tsx`
- Test: `tests/unit/proactiveTopicService.test.ts`

- [ ] **Step 1: Write failing tests**

Assert PetApp renders structured bubbles with a "回复" button and the scheduler emits bundled topics only when enabled.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/renderer/PetApp.test.tsx tests/unit/proactiveTopicService.test.ts`
Expected: FAIL because structured bubbles and scheduler do not exist.

- [ ] **Step 3: Implement pet bubble action and scheduler**

Support string bubbles and structured bubble payloads, add reply button click handling, and wire a timer-based main service that reschedules on config changes.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/renderer/PetApp.test.tsx tests/unit/proactiveTopicService.test.ts`
Expected: PASS.

### Task 8: Full Verification

**Files:**
- Modify: only files touched by Tasks 1-7 when typecheck, tests, or build expose a defect in this feature.

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS.


