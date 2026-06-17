import { z } from "zod";

export const modelConfigSchema = z.object({
  baseURL: z.string().default("https://api.deepseek.com"),
  model: z.string().default("deepseek-flash"),
  temperature: z.number().min(0).max(2).default(0.2),
  timeoutMs: z.number().int().positive().default(60000),
});

export const appConfigSchema = z.object({
  model: modelConfigSchema,
  shortcuts: z.object({
    captureArea: z.string(),
    captureOcr: z.string(),
    openTranslator: z.string(),
    quickTranslateSelection: z.string(),
    togglePet: z.string(),
  }),
  translator: z.object({
    defaultSourceLanguage: z.string(),
    defaultTargetLanguages: z.array(z.string()),
    historyLimit: z.number().int().min(0).max(100),
  }),
  screenshot: z.object({
    hidePetWhenCapturing: z.boolean(),
    saveDirectoryName: z.string(),
    filenamePattern: z.string(),
    enableScrollingCaptureExperiment: z.boolean(),
  }),
  ocr: z.object({
    mode: z.enum(["local", "model"]),
    languages: z.array(z.string()),
    sendToTranslatorAfterRecognize: z.boolean(),
  }),
  pet: z.object({
    defaultHeight: z.number().int().min(96).max(480),
    opacity: z.number().min(0.3).max(1),
    alwaysOnTop: z.boolean(),
    wanderEnabled: z.boolean(),
    animationSpeed: z.number().min(0.5).max(2),
  }),
  plugins: z.record(z.boolean()),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const defaultAppConfig: AppConfig = {
  model: {
    baseURL: "https://api.deepseek.com",
    model: "deepseek-flash",
    temperature: 0.2,
    timeoutMs: 60000,
  },
  shortcuts: {
    captureArea: "CommandOrControl+Shift+A",
    captureOcr: "CommandOrControl+Shift+O",
    openTranslator: "CommandOrControl+Shift+T",
    quickTranslateSelection: "CommandOrControl+Shift+Y",
    togglePet: "CommandOrControl+Shift+P",
  },
  translator: {
    defaultSourceLanguage: "auto",
    defaultTargetLanguages: ["zh-CN", "en", "ja"],
    historyLimit: 20,
  },
  screenshot: {
    hidePetWhenCapturing: true,
    saveDirectoryName: "screenshots",
    filenamePattern: "lacritomato-yyyyMMdd-HHmmss",
    enableScrollingCaptureExperiment: true,
  },
  ocr: {
    mode: "local",
    languages: ["chi_sim", "eng"],
    sendToTranslatorAfterRecognize: false,
  },
  pet: {
    defaultHeight: 224,
    opacity: 1,
    alwaysOnTop: true,
    wanderEnabled: true,
    animationSpeed: 1,
  },
  plugins: {
    translator: true,
    screenshot: true,
  },
};
