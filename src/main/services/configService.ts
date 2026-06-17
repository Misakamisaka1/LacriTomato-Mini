import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appConfigSchema, defaultAppConfig, type AppConfig } from "../../shared/configSchema.js";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

export interface ConfigServiceOptions {
  userDataPath: string;
}

export interface ConfigService {
  getConfig(): AppConfig;
  setConfig(update: DeepPartial<AppConfig>): AppConfig;
}

function mergeConfig(base: AppConfig, update: DeepPartial<AppConfig>): AppConfig {
  return appConfigSchema.parse({
    ...base,
    ...update,
    model: { ...base.model, ...update.model },
    shortcuts: { ...base.shortcuts, ...update.shortcuts },
    translator: { ...base.translator, ...update.translator },
    screenshot: { ...base.screenshot, ...update.screenshot },
    ocr: { ...base.ocr, ...update.ocr },
    pet: { ...base.pet, ...update.pet },
    plugins: { ...base.plugins, ...update.plugins },
  });
}

export function createConfigService(options: ConfigServiceOptions): ConfigService {
  const configPath = join(options.userDataPath, "config.json");
  mkdirSync(options.userDataPath, { recursive: true });

  let current = defaultAppConfig;

  if (existsSync(configPath)) {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as DeepPartial<AppConfig>;
    current = mergeConfig(defaultAppConfig, parsed);
  } else {
    writeFileSync(configPath, JSON.stringify(current, null, 2), "utf8");
  }

  return {
    getConfig() {
      return current;
    },
    setConfig(update) {
      current = mergeConfig(current, update);
      writeFileSync(configPath, JSON.stringify(current, null, 2), "utf8");
      return current;
    },
  };
}
