import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/plugins/translator/renderer/TranslatorPanel.css"), "utf8");

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`).exec(css);
  if (!match?.groups?.body) {
    throw new Error(`CSS selector not found: ${selector}`);
  }

  return match.groups.body;
}

describe("translator panel styles", () => {
  it("separates the translation workspace from the history rail", () => {
    const layout = cssBlock(".translator-layout");
    const workbench = cssBlock(".translator-workbench");
    const history = cssBlock(".translator-history");

    expect(layout).toContain("grid-template-columns: minmax(0, 1fr) minmax(210px, 248px);");
    expect(layout).toContain("overflow: hidden;");
    expect(workbench).toContain("overflow-y: auto;");
    expect(history).toContain("overflow: hidden;");
  });

  it("keeps history item titles on one ellipsized line without vertical clipping", () => {
    const button = cssBlock(".translator-history-list button");
    const title = cssBlock(".translator-history-list button span");

    expect(button).toContain("min-height: 64px;");
    expect(title).toContain("display: block;");
    expect(title).toContain("line-height: 1.35;");
    expect(title).toContain("overflow: hidden;");
    expect(title).toContain("text-overflow: ellipsis;");
    expect(title).toContain("white-space: nowrap;");
    expect(title).not.toContain("-webkit-line-clamp");
  });
});
