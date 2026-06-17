export interface LanguageOption {
  code: string;
  label: string;
}

export const sourceLanguages: LanguageOption[] = [
  { code: "auto", label: "自动检测" },
  { code: "zh-CN", label: "中文" },
  { code: "en", label: "英文" },
  { code: "ja", label: "日文" },
  { code: "ko", label: "韩文" },
  { code: "fr", label: "法文" },
  { code: "de", label: "德文" },
  { code: "es", label: "西班牙文" },
];

export const targetLanguages = sourceLanguages.filter((item) => item.code !== "auto");
