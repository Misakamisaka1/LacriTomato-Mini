import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createChatStateService } from "../../src/main/services/chatStateService";

let dir: string | undefined;
let idCounter = 0;
let nowCounter = 0;

function makeService() {
  dir = mkdtempSync(join(tmpdir(), "petdex-chat-state-"));
  idCounter = 0;
  nowCounter = 0;
  return createChatStateService({
    userDataPath: dir,
    createId: () => `message-${++idCounter}`,
    now: () => new Date(Date.UTC(2026, 5, 30, 8, 0, nowCounter++)).toISOString(),
  });
}

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("chat state service", () => {
  it("persists chat history and caps it by the configured limit", () => {
    const service = makeService();

    service.appendMessages([
      { role: "user", content: "第一句" },
      { role: "assistant", content: "收到" },
      { role: "user", content: "第二句" },
    ], 2);

    expect(service.listHistory()).toEqual([
      { id: "message-2", role: "assistant", content: "收到", createdAt: "2026-06-30T08:00:01.000Z" },
      { id: "message-3", role: "user", content: "第二句", createdAt: "2026-06-30T08:00:02.000Z" },
    ]);
    expect(JSON.parse(readFileSync(join(dir!, "chat-history.json"), "utf8"))).toHaveLength(2);
  });

  it("clears persisted chat history without touching memory", () => {
    const service = makeService();

    service.appendMessages([{ role: "user", content: "你好" }], 30);
    service.setMemory("用户喜欢番茄。" );

    expect(service.clearHistory()).toEqual([]);
    expect(service.listHistory()).toEqual([]);
    expect(service.getMemory().summary).toBe("用户喜欢番茄。");
  });

  it("persists editable memory and clears it independently", () => {
    const service = makeService();

    const saved = service.setMemory("用户叫小林。\n用户喜欢短回复。");

    expect(saved.summary).toBe("用户叫小林。\n用户喜欢短回复。");
    expect(saved.updatedAt).toBe("2026-06-30T08:00:00.000Z");
    expect(service.getMemory()).toEqual(saved);
    expect(service.clearMemory()).toEqual({ summary: "", updatedAt: "2026-06-30T08:00:01.000Z" });
  });

  it("recovers from malformed state files by rewriting valid empty state", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-chat-state-"));
    writeFileSync(join(dir, "chat-history.json"), "not json", "utf8");
    writeFileSync(join(dir, "chat-memory.json"), "not json", "utf8");

    const service = createChatStateService({ userDataPath: dir });

    expect(service.listHistory()).toEqual([]);
    expect(service.getMemory()).toEqual({ summary: "" });
    expect(JSON.parse(readFileSync(join(dir, "chat-history.json"), "utf8"))).toEqual([]);
    expect(JSON.parse(readFileSync(join(dir, "chat-memory.json"), "utf8"))).toEqual({ summary: "" });
  });

  it("appends stable user facts to memory deterministically", () => {
    const service = makeService();

    service.updateMemoryFromUserMessage("我叫番茄，喜欢晚上写代码。", true);
    service.updateMemoryFromUserMessage("哈哈今天随便聊聊", true);

    expect(service.getMemory().summary).toContain("我叫番茄，喜欢晚上写代码。");
    expect(service.getMemory().summary).not.toContain("哈哈今天随便聊聊");
  });
});

