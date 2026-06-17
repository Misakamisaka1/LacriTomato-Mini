import { useEffect, useState } from "react";
import type { AppConfig } from "../../shared/configSchema";
import { defaultAppConfig } from "../../shared/configSchema";
import "./SettingsApp.css";

export function SettingsApp() {
  const [config, setConfig] = useState<AppConfig>(defaultAppConfig);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    window.petdex.config.get().then(setConfig);
  }, []);

  async function saveModel() {
    await window.petdex.config.set({ model: config.model });
    if (apiKey.trim()) {
      await window.petdex.config.setApiKey(apiKey);
      setApiKey("");
    }
  }

  return (
    <main className="settings-root">
      <aside className="settings-sidebar">
        <button type="button">模型</button>
        <button type="button">快捷键</button>
        <button type="button">截图</button>
        <button type="button">OCR</button>
        <button type="button">桌宠</button>
        <button type="button">插件</button>
      </aside>
      <section className="settings-content">
        <h1>设置</h1>
        <label>
          Base URL
          <input
            value={config.model.baseURL}
            onChange={(event) => setConfig({ ...config, model: { ...config.model, baseURL: event.target.value } })}
          />
        </label>
        <label>
          Model
          <input
            value={config.model.model}
            onChange={(event) => setConfig({ ...config, model: { ...config.model, model: event.target.value } })}
          />
        </label>
        <label>
          API Key
          <input value={apiKey} type="password" onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <label>
          截图快捷键
          <input
            value={config.shortcuts.captureArea}
            onChange={(event) => setConfig({
              ...config,
              shortcuts: { ...config.shortcuts, captureArea: event.target.value },
            })}
          />
        </label>
        <button type="button" onClick={saveModel}>保存</button>
      </section>
    </main>
  );
}
