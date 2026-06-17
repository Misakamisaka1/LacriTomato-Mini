import { useState } from "react";
import { sourceLanguages, targetLanguages } from "../../../shared/languages";
import type { TranslateResult } from "../types";

export function TranslatorPanel() {
  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [selectedTargets, setSelectedTargets] = useState(["en"]);
  const [result, setResult] = useState<TranslateResult | undefined>();
  const [error, setError] = useState("");

  async function translate() {
    setError("");
    try {
      const response = await window.petdex.model.translate({
        sourceText,
        sourceLanguage,
        targetLanguages: selectedTargets,
        style: "accurate",
      }) as TranslateResult;
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "翻译失败");
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: "Microsoft YaHei, Segoe UI, sans-serif" }}>
      <h1>翻译</h1>
      <label>
        源语言
        <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
          {sourceLanguages.map((language) => (
            <option key={language.code} value={language.code}>{language.label}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>目标语言</legend>
        {targetLanguages.map((language) => (
          <label key={language.code}>
            <input
              type="checkbox"
              checked={selectedTargets.includes(language.code)}
              onChange={(event) => {
                setSelectedTargets((current) =>
                  event.target.checked
                    ? [...current, language.code]
                    : current.filter((code) => code !== language.code),
                );
              }}
            />
            {language.label}
          </label>
        ))}
      </fieldset>
      <textarea
        aria-label="输入文本"
        value={sourceText}
        onChange={(event) => setSourceText(event.target.value)}
        rows={8}
        style={{ width: "100%", marginTop: 12 }}
      />
      <button type="button" onClick={translate} disabled={!sourceText.trim() || selectedTargets.length === 0}>
        翻译
      </button>
      {error && <p role="alert">{error}</p>}
      {result?.results.map((item) => (
        <section key={item.language}>
          <h2>{item.language}</h2>
          <p>{item.text}</p>
        </section>
      ))}
    </main>
  );
}
