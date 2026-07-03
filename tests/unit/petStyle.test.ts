import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/renderer/shell/PetApp.css"), "utf8");

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`).exec(css);
  if (!match?.groups?.body) {
    throw new Error(`CSS selector not found: ${selector}`);
  }

  return match.groups.body;
}

describe("pet styles", () => {
  it("does not add a synthetic shadow around the sprite edge", () => {
    const sprite = cssBlock(".pet-sprite");

    expect(sprite).not.toContain("drop-shadow");
    expect(sprite).not.toContain("box-shadow");
  });

  it("does not center every renderer window with a global body/root rule", () => {
    const globalBodyRootBlocks = [...css.matchAll(/(?:^|\})\s*body,\s*#root\s*\{(?<body>[^}]*)\}/g)]
      .map((match) => match.groups?.body ?? "");

    expect(globalBodyRootBlocks.join("\n")).not.toContain("display: flex");
    expect(globalBodyRootBlocks.join("\n")).not.toContain("align-items: flex-end");
    expect(globalBodyRootBlocks.join("\n")).not.toContain("justify-content: center");
  });});
