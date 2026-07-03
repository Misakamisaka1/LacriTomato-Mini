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

describe("screenshot styles", () => {
  it("uses a green selection border with a neutral gray shadow", () => {
    const selection = cssBlock(".screenshot-selection");

    expect(selection).toContain("border: 2px solid #22c55e;");
    expect(selection).toContain("background: rgba(255, 255, 255, 0.06);");
    expect(selection).toContain("box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.42), 0 0 0 9999px rgba(0, 0, 0, 0.38);");
    expect(selection).not.toContain("rgba(34, 197, 94");
  });

  it("lets OCR results expand beyond short captures without adding internal scrollbars", () => {
    const layer = cssBlock(".screenshot-ocr-layer");
    const overlay = cssBlock(".screenshot-ocr-overlay");
    const text = cssBlock(".screenshot-ocr-overlay pre");

    expect(layer).toContain("height: calc(100% - 24px);");
    expect(layer).toContain("overflow: visible;");
    expect(overlay).toContain("min-height: 100%;");
    expect(overlay).toContain("overflow: visible;");
    expect(overlay).not.toContain("max-height:");
    expect(overlay).not.toContain("overflow: auto;");
    expect(text).not.toContain("height: 100%;");
    expect(text).toContain("overflow: visible;");
    expect(text).not.toContain("overflow: hidden;");
  });

  it("keeps OCR overlay controls compact and outside the text area", () => {
    const actions = cssBlock(".screenshot-ocr-actions");
    const detachedActions = cssBlock(".screenshot-ocr-actions--detached");
    const toggle = cssBlock(".screenshot-ocr-toggle");

    expect(actions).toContain("display: inline-flex;");
    expect(detachedActions).toContain("top: calc(100% + 8px);");
    expect(toggle).toContain("min-height: 28px;");
  });
  it("keeps screenshot tips free of bottom shadow", () => {
    const card = cssBlock(".screenshot-tip-card");

    expect(card).not.toContain("box-shadow:");
  });
});