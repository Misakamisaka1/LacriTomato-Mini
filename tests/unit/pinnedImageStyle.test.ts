import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/plugins/screenshot/renderer/screenshot.css"), "utf8");

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`).exec(css);
  if (!match?.groups?.body) {
    throw new Error(`CSS selector not found: ${selector}`);
  }

  return match.groups.body;
}

describe("pinned image styles", () => {
  it("keeps the pinned image toolbar compact so it does not cover the image", () => {
    const toolbar = cssBlock(".pinned-image-toolbar");
    const button = cssBlock(".pinned-image-tool-button");

    expect(toolbar).toContain("gap: 4px;");
    expect(toolbar).toContain("padding: 4px;");
    expect(button).toContain("width: 28px;");
    expect(button).toContain("height: 28px;");
  });
});