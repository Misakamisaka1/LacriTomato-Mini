import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels } from "../shared/ipcChannels.js";
import type { PetdexApi } from "./api.js";

const api: PetdexApi = {
  config: {
    get: () => ipcRenderer.invoke(ipcChannels.configGet),
    set: (update) => ipcRenderer.invoke(ipcChannels.configSet, update),
    setApiKey: (apiKey) => ipcRenderer.invoke(ipcChannels.secureConfigSetApiKey, apiKey),
  },
  plugins: {
    listMenuItems: () => ipcRenderer.invoke(ipcChannels.pluginListMenuItems),
    invokeAction: (action) => ipcRenderer.invoke(ipcChannels.pluginInvokeAction, action),
  },
  model: {
    translate: (request) => ipcRenderer.invoke(ipcChannels.modelTranslate, request),
  },
};

contextBridge.exposeInMainWorld("petdex", api);
