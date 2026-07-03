import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface SecretServiceOptions {
  userDataPath: string;
  safeStorage?: SafeStorageLike;
}

export interface ApiKeyStorageStatus {
  saved: boolean;
  secure: boolean;
}

export interface SecretService {
  getApiKey(): string;
  hasApiKey(): boolean;
  setApiKey(apiKey: string): void;
  getStorageStatus(): ApiKeyStorageStatus;
}

interface SecretFile {
  apiKey?: string;
  apiKeyEncrypted?: string;
}

function readSecretFile(path: string): SecretFile {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as SecretFile;
  } catch {
    return {};
  }
}

function canEncrypt(safeStorage?: SafeStorageLike) {
  try {
    return Boolean(safeStorage?.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function decryptApiKey(current: SecretFile, safeStorage?: SafeStorageLike) {
  if (current.apiKeyEncrypted && canEncrypt(safeStorage)) {
    try {
      return safeStorage?.decryptString(Buffer.from(current.apiKeyEncrypted, "base64")).trim() ?? "";
    } catch {
      return "";
    }
  }

  return current.apiKey?.trim() ?? "";
}

export function createSecretService(options: SecretServiceOptions): SecretService {
  mkdirSync(options.userDataPath, { recursive: true });
  const secretPath = join(options.userDataPath, "secrets.json");
  let current = readSecretFile(secretPath);

  function write() {
    writeFileSync(secretPath, JSON.stringify(current, null, 2), { encoding: "utf8", mode: 0o600 });
  }

  return {
    getApiKey() {
      return decryptApiKey(current, options.safeStorage);
    },
    hasApiKey() {
      return Boolean(decryptApiKey(current, options.safeStorage));
    },
    setApiKey(apiKey) {
      const trimmed = apiKey.trim();
      if (canEncrypt(options.safeStorage)) {
        current = {
          apiKeyEncrypted: options.safeStorage?.encryptString(trimmed).toString("base64"),
        };
      } else {
        current = { apiKey: trimmed };
      }
      write();
    },
    getStorageStatus() {
      return {
        saved: Boolean(decryptApiKey(current, options.safeStorage)),
        secure: Boolean(current.apiKeyEncrypted && canEncrypt(options.safeStorage)),
      };
    },
  };
}