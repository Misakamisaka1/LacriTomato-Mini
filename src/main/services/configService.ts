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

const modelAliases: Record<string, string> = {
  "deepseek-flash": "deepseek-v4-flash",
};

function normalizeConfig(config: AppConfig): AppConfig {
  const normalizedModel = modelAliases[config.model.model] ?? config.model.model;

  if (normalizedModel === config.model.model) {
    return config;
  }

  return {
    ...config,
    model: {
      ...config.model,
      model: normalizedModel,
    },
  };
}

function mergeConfig(base: AppConfig, update: DeepPartial<AppConfig>): AppConfig {
  return normalizeConfig(appConfigSchema.parse({
    ...base,
    ...update,
    model: { ...base.model, ...update.model },
    shortcuts: { ...base.shortcuts, ...update.shortcuts },
    translator: { ...base.translator, ...update.translator },
    screenshot: { ...base.screenshot, ...update.screenshot },
    recording: { ...base.recording, ...update.recording },
    ocr: { ...base.ocr, ...update.ocr },
    pet: { ...base.pet, ...update.pet },
    chat: { ...base.chat, ...update.chat },
    plugins: { ...base.plugins, ...update.plugins },
  }));
}

export function createConfigService(options: ConfigServiceOptions): ConfigService {
  const configPath = join(options.userDataPath, "config.json");
  mkdirSync(options.userDataPath, { recursive: true });

  let current = defaultAppConfig;

  if (existsSync(configPath)) {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as DeepPartial<AppConfig>;
    current = mergeConfig(defaultAppConfig, parsed);
    writeFileSync(configPath, JSON.stringify(current, null, 2), "utf8");
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