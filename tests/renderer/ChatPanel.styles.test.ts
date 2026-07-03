import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/plugins/chat/renderer/ChatPanel.css"), "utf8");

describe("ChatPanel styles", () => {
  it("uses the app dark scrollbar treatment for the message list and composer textarea", () => {
    expect(css).toContain(".chat-messages,");
    expect(css).toContain(".chat-composer textarea {");
    expect(css).toContain("scrollbar-width: thin;");
    expect(css).toContain("scrollbar-color: #4b5565 #11141a;");
    expect(css).toContain(".chat-messages::-webkit-scrollbar");
    expect(css).toContain(".chat-composer textarea::-webkit-scrollbar-thumb:hover");
  });
});