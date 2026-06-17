export interface TranslateRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguages: string[];
  style: "accurate" | "natural" | "concise";
}

export interface TranslateResult {
  detectedLanguage?: string;
  results: Array<{
    language: string;
    text: string;
  }>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  raw?: string;
}
