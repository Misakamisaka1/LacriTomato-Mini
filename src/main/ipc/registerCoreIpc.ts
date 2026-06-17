import { ipcMain } from "electron";
import type { TranslateRequest } from "../../plugins/translator/types.js";
import { ipcChannels } from "../../shared/ipcChannels.js";
import type { ConfigService } from "../services/configService.js";
import type { ModelProviderConfig, ModelService } from "../services/modelService.js";
import type { PluginRegistry } from "../services/pluginRegistry.js";

export interface CoreIpcDependencies {
  configService: ConfigService;
  modelService?: ModelService;
  pluginRegistry: PluginRegistry;
  getModelProviderConfig?(): ModelProviderConfig;
  invokePluginAction(action: string): Promise<void>;
  setApiKey?(apiKey: string): Promise<void>;
}

export function registerCoreIpc(deps: CoreIpcDependencies): void {
  ipcMain.handle(ipcChannels.configGet, () => deps.configService.getConfig());
  ipcMain.handle(ipcChannels.configSet, (_event, update) => deps.configService.setConfig(update));
  ipcMain.handle(ipcChannels.secureConfigSetApiKey, async (_event, apiKey: string) => {
    await deps.setApiKey?.(apiKey);
  });
  ipcMain.handle(ipcChannels.modelTranslate, (_event, request: TranslateRequest) => {
    if (!deps.modelService || !deps.getModelProviderConfig) {
      throw new Error("Model service is not configured");
    }

    return deps.modelService.translate(request, deps.getModelProviderConfig());
  });
  ipcMain.handle(ipcChannels.pluginListMenuItems, () => deps.pluginRegistry.getMenuItems());
  ipcMain.handle(ipcChannels.pluginInvokeAction, (_event, action: string) => deps.invokePluginAction(action));
}
