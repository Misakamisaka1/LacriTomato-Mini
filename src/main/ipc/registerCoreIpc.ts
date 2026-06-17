import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels.js";
import type { ConfigService } from "../services/configService.js";
import type { PluginRegistry } from "../services/pluginRegistry.js";

export interface CoreIpcDependencies {
  configService: ConfigService;
  pluginRegistry: PluginRegistry;
  invokePluginAction(action: string): Promise<void>;
  setApiKey?(apiKey: string): Promise<void>;
}

export function registerCoreIpc(deps: CoreIpcDependencies): void {
  ipcMain.handle(ipcChannels.configGet, () => deps.configService.getConfig());
  ipcMain.handle(ipcChannels.configSet, (_event, update) => deps.configService.setConfig(update));
  ipcMain.handle(ipcChannels.secureConfigSetApiKey, async (_event, apiKey: string) => {
    await deps.setApiKey?.(apiKey);
  });
  ipcMain.handle(ipcChannels.pluginListMenuItems, () => deps.pluginRegistry.getMenuItems());
  ipcMain.handle(ipcChannels.pluginInvokeAction, (_event, action: string) => deps.invokePluginAction(action));
}
