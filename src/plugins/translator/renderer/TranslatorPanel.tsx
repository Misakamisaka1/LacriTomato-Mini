import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AppConfig } from "../../../shared/configSchema";
import { defaultAppConfig } from "../../../shared/configSchema";
import { sourceLanguages, targetLanguages } from "../../../shared/languages";
import type { TranslateResult } from "../types";
import "./TranslatorPanel.css";

const disconnectedMessage = "桌宠服务未连接，请重新启动应用。";
const historyStorageKey = "lacritomato.translator.history";

interface TranslationHistoryEntry {
  id: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguages: string[];
  result: TranslateResult;
  createdAt: number;
}

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  return {
    sourceText: params.get("text") ?? "",
    autoTranslate: params.get("autoTranslate") === "1",
  };
}

function readHistory(): TranslationHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey) ?? "[]") as TranslationHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: TranslationHistoryEntry[]) {
  if (entries.length === 0) {
    localStorage.removeItem(historyStorageKey);
    return;
  }

  localStorage.setItem(historyStorageKey, JSON.stringify(entries));
}

function createHistoryEntry(
  sourceText: string,
  sourceLanguage: string,
  targetLanguages: string[],
  result: TranslateResult,
): TranslationHistoryEntry {
  return {
    id: `translation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceText,
    sourceLanguage,
    targetLanguages,
    result,
    createdAt: Date.now(),
  };
}

function languageLabel(code: string) {
  return sourceLanguages.find((language) => language.code === code)?.label ?? code;
}

function formatHistoryTargets(entry: TranslationHistoryEntry) {
  return entry.targetLanguages.map(languageLabel).join("、");
}

export function TranslatorPanel() {
  const initialState = useRef(getInitialState());
  const autoTranslateStarted = useRef(false);
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig);
  const [sourceText, setSourceText] = useState(initialState.current.sourceText);
  const [sourceLanguage, setSourceLanguage] = useState(defaultAppConfig.translator.defaultSourceLanguage);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(["en"]);
  const [result, setResult] = useState<TranslateResult | undefined>();
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([]);
  const [error, setError] = useState("");

  async function translate(text = sourceText, targets = selectedTargets, language = sourceLanguage) {
    const api = window.petdex;
    if (!api) {
      setError(disconnectedMessage);
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText || targets.length === 0) {
      return;
    }

    setError("");
    try {
      const activeConfig = await api.config.get().catch(() => config);
      setConfig(activeConfig);
      const response = await api.model.translate({
        sourceText: trimmedText,
        sourceLanguage: language,
        targetLanguages: targets,
        style: "accurate",
      }) as TranslateResult;
      setResult(response);

      const historyLimit = activeConfig.translator.historyLimit;
      if (historyLimit > 0) {
        setHistory((current) => {
          const next = [
            createHistoryEntry(trimmedText, language, targets, response),
            ...current.filter((entry) => entry.sourceText !== trimmedText),
          ].slice(0, historyLimit);
          writeHistory(next);
          return next;
        });
      } else {
        writeHistory([]);
        setHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "翻译失败");
    }
  }

  useEffect(() => {
    const api = window.petdex;
    if (!api) {
      return;
    }

    void api.config.get()
      .then((nextConfig) => {
        setConfig(nextConfig);
        setSourceLanguage(nextConfig.translator.defaultSourceLanguage);
        if (!initialState.current.autoTranslate) {
          setSelectedTargets(nextConfig.translator.defaultTargetLanguages);
        }

        if (nextConfig.translator.historyLimit > 0) {
          const nextHistory = readHistory().slice(0, nextConfig.translator.historyLimit);
          setHistory(nextHistory);
          writeHistory(nextHistory);
        } else {
          setHistory([]);
          writeHistory([]);
        }
      })
      .catch(() => {
        setHistory(readHistory().slice(0, defaultAppConfig.translator.historyLimit));
      });
  }, []);

  useEffect(() => {
    if (!initialState.current.autoTranslate || autoTranslateStarted.current) {
      return;
    }

    autoTranslateStarted.current = true;
    void translate(initialState.current.sourceText, selectedTargets);
  }, [selectedTargets]);

  async function copyResult(text: string) {
    await navigator.clipboard?.writeText(text);
  }

  function restoreHistory(entry: TranslationHistoryEntry) {
    setSourceText(entry.sourceText);
    setSourceLanguage(entry.sourceLanguage);
    setSelectedTargets(entry.targetLanguages);
    setResult(entry.result);
  }

  function useResultAsInput(text: string, language: string) {
    setSourceText(text);
    setSourceLanguage(language);
  }

  function continueFromResult(text: string, language: string) {
    useResultAsInput(text, language);
    void translate(text, selectedTargets, language);
  }

  return (
    <main className="translator-root">
      <header className="translator-titlebar">
        <div className="translator-title-copy">
          <h1>翻译</h1>
        </div>
        <button
          className="translator-close"
          type="button"
          aria-label="关闭翻译"
          title="关闭"
          onClick={() => {
            void window.petdex?.windowControls.close();
          }}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <section className="translator-content">
        <div className="translator-layout" aria-label="翻译布局">
          <section className="translator-workbench" aria-label="翻译工作区">
            <div className="translator-language-row">
              <label className="translator-field">
                <span>源语言</span>
                <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
                  {sourceLanguages.map((language) => (
                    <option key={language.code} value={language.code}>{language.label}</option>
                  ))}
                </select>
              </label>
              <fieldset className="translator-target-panel">
                <legend>目标语言</legend>
                <div className="translator-targets">
                  {targetLanguages.map((language) => {
                    const isSelected = selectedTargets.includes(language.code);
                    return (
                      <label className={`translator-target${isSelected ? " is-selected" : ""}`} key={language.code}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) => {
                            setSelectedTargets((current) =>
                              event.target.checked
                                ? [...current, language.code]
                                : current.filter((code) => code !== language.code),
                            );
                          }}
                        />
                        <span className="translator-target-check" aria-hidden="true" />
                        <span className="translator-target-label">{language.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <section className="translator-editor" aria-label="原文输入">
              <div className="translator-section-heading">
                <h2>原文</h2>
                <span>{sourceText.trim().length} 字符</span>
              </div>
              <textarea
                aria-label="输入文本"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                rows={8}
              />
              <div className="translator-actions">
                <button type="button" className="translator-submit" onClick={() => void translate()} disabled={!sourceText.trim() || selectedTargets.length === 0}>
                  翻译
                </button>
                <button type="button" className="translator-secondary-action" onClick={() => { setSourceText(""); setResult(undefined); }} disabled={!sourceText.trim()}>
                  清空输入
                </button>
                <span>{selectedTargets.length} 个目标语言</span>
              </div>
            </section>
            {error && <p role="alert" className="translator-error">{error}</p>}
            {result && result.results.length > 0 && (
              <section className="translator-results" aria-label="翻译结果">
                <div className="translator-section-heading">
                  <h2>翻译结果</h2>
                  {result.detectedLanguage && <span>识别为 {languageLabel(result.detectedLanguage)}</span>}
                </div>
                <div className="translator-result-grid">
                  {result.results.map((item) => (
                    <article className="translator-result" key={item.language}>
                      <h3>{languageLabel(item.language)}</h3>
                      <p>{item.text}</p>
                      <div className="translator-result-actions">
                        <button type="button" aria-label={`复制${languageLabel(item.language)}结果`} onClick={() => void copyResult(item.text)}>
                          复制
                        </button>
                        <button type="button" aria-label={`用${languageLabel(item.language)}结果替换输入`} onClick={() => useResultAsInput(item.text, item.language)}>
                          替换输入
                        </button>
                        <button type="button" aria-label={`继续翻译${languageLabel(item.language)}结果`} onClick={() => continueFromResult(item.text, item.language)}>
                          继续翻译
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
          {config.translator.historyLimit > 0 && (
            <aside className="translator-history" aria-label="翻译历史">
              <div className="translator-history-header">
                <h2>历史记录</h2>
                <span>{history.length}/{config.translator.historyLimit}</span>
              </div>
              {history.length > 0 ? (
                <div className="translator-history-list">
                  {history.map((entry) => (
                    <button key={entry.id} type="button" aria-label={entry.sourceText} onClick={() => restoreHistory(entry)}>
                      <span>{entry.sourceText}</span>
                      <small>{formatHistoryTargets(entry)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="translator-history-empty">暂无历史记录</p>
              )}
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
