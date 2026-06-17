export const ipcChannels = {
  configGet: "core:config:get",
  configSet: "core:config:set",
  secureConfigSetApiKey: "core:secure-config:set-api-key",
  modelTranslate: "core:model:translate",
  ocrRecognize: "core:ocr:recognize",
  pluginListMenuItems: "core:plugin:list-menu-items",
  pluginInvokeAction: "core:plugin:invoke-action",
  screenshotStartCapture: "plugin:screenshot:start-capture",
  screenshotSaveCapture: "plugin:screenshot:save-capture",
} as const;
