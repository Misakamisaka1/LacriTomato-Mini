export interface LanguageOption {
  code: string;
  label: string;
}

export const sourceLanguages: LanguageOption[] = [
  { code: "auto", label: "自动检测" },
  { code: "zh-CN", label: "中文" },
  { code: "zh-TW", label: "繁体中文" },
  { code: "en", label: "英文" },
  { code: "ja", label: "日文" },
  { code: "ko", label: "韩文" },
  { code: "fr", label: "法文" },
  { code: "de", label: "德文" },
  { code: "es", label: "西班牙文" },
  { code: "it", label: "意大利文" },
  { code: "pt", label: "葡萄牙文" },
  { code: "ru", label: "俄文" },
  { code: "ar", label: "阿拉伯文" },
  { code: "vi", label: "越南文" },
  { code: "th", label: "泰文" },
  { code: "id", label: "印尼文" },
];

export const targetLanguages = sourceLanguages.filter((item) => item.code !== "auto");
