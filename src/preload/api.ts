import type { AppConfig } from "../shared/configSchema.js";
import type { PluginMenuItem } from "../shared/pluginTypes.js";

export interface PetdexApi {
  config: {
    get(): Promise<AppConfig>;
    set(update: Partial<AppConfig>): Promise<AppConfig>;
    setApiKey(apiKey: string): Promise<void>;
  };
  plugins: {
    listMenuItems(): Promise<PluginMenuItem[]>;
    invokeAction(action: string): Promise<void>;
  };
  model: {
    translate(request: unknown): Promise<unknown>;
  };
}

declare global {
  interface Window {
    petdex: PetdexApi;
  }
}
