import type { PetdexApi } from "../preload/api";

declare global {
  interface Window {
    petdex?: PetdexApi;
  }
}

export {};
