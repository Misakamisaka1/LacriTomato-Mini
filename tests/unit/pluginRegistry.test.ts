import { describe, expect, it } from "vitest";
import { createPluginRegistry } from "../../src/main/services/pluginRegistry";
import { screenshotManifest } from "../../src/plugins/screenshot/manifest";
import { translatorManifest } from "../../src/plugins/translator/manifest";

describe("plugin registry", () => {
  it("collects menu items from enabled plugins", () => {
    const registry = createPluginRegistry([translatorManifest, screenshotManifest], {
      translator: true,
      screenshot: true,
    });

    expect(registry.getMenuItems().map((item) => item.label)).toEqual([
      "翻译",
      "截图",
      "截图并 OCR",
      "贴图管理",
    ]);
  });

  it("skips disabled plugin contributions", () => {
    const registry = createPluginRegistry([translatorManifest, screenshotManifest], {
      translator: false,
      screenshot: true,
    });

    expect(registry.getMenuItems().some((item) => item.label === "翻译")).toBe(false);
  });
});
