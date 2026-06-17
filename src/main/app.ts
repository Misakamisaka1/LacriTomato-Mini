import { app, Menu, Tray } from "electron";
import { join } from "node:path";
import { defaultAppConfig } from "../shared/configSchema.js";
import { screenshotManifest } from "../plugins/screenshot/manifest.js";
import { translatorManifest } from "../plugins/translator/manifest.js";
import { registerCoreIpc } from "./ipc/registerCoreIpc.js";
import { createConfigService } from "./services/configService.js";
import { createModelService } from "./services/modelService.js";
import { createPluginRegistry } from "./services/pluginRegistry.js";
import { createPetWindow } from "./windows/createPetWindow.js";
import { createSettingsWindow } from "./windows/createSettingsWindow.js";
import { createTranslatorPanel } from "./windows/createTranslatorPanel.js";

let tray: Tray | undefined;

async function main() {
  await app.whenReady();

  const preloadPath = join(process.cwd(), "dist/src/preload/index.js");
  let apiKey = "";
  const configService = createConfigService({ userDataPath: app.getPath("userData") });
  const modelService = createModelService({ fetch });
  const pluginRegistry = createPluginRegistry([translatorManifest, screenshotManifest], defaultAppConfig.plugins);
  const petWindow = createPetWindow(preloadPath);

  async function invokePluginAction(action: string): Promise<void> {
    if (action === "translator.open") {
      createTranslatorPanel(preloadPath);
      return;
    }

    if (action === "settings.open") {
      createSettingsWindow(preloadPath);
      return;
    }

    petWindow.webContents.send("pet:bubble", `功能 ${action} 已收到`);
  }

  registerCoreIpc({
    configService,
    modelService,
    pluginRegistry,
    getModelProviderConfig() {
      return { ...configService.getConfig().model, apiKey };
    },
    invokePluginAction,
    async setApiKey(nextApiKey: string) {
      apiKey = nextApiKey.trim();
      petWindow.webContents.send("pet:bubble", "API Key 已保存");
    },
  });

  tray = new Tray(join(process.cwd(), "assets/pet/spritesheet.webp"));
  tray.setToolTip("LacriTomato Mini");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示宠物", click: () => petWindow.show() },
    { label: "隐藏宠物", click: () => petWindow.hide() },
    { label: "设置", click: () => createSettingsWindow(preloadPath) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));
}

app.on("window-all-closed", () => {
  // Keep the tray-hosted pet app alive until the user explicitly exits.
});

main().catch((error) => {
  console.error(error);
  app.quit();
});
