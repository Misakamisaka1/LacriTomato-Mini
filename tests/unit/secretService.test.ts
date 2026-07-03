import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSecretService } from "../../src/main/services/secretService";

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("secret service", () => {
  it("persists the API key without exposing it through config", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-secrets-"));

    const first = createSecretService({ userDataPath: dir });
    expect(first.hasApiKey()).toBe(false);

    first.setApiKey("  sk-test  ");
    expect(first.hasApiKey()).toBe(true);
    expect(first.getApiKey()).toBe("sk-test");

    const second = createSecretService({ userDataPath: dir });
    expect(second.hasApiKey()).toBe(true);
    expect(second.getApiKey()).toBe("sk-test");
  });

  it("encrypts the API key with safe storage when it is available", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-secrets-"));
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
      decryptString: (value: Buffer) => value.toString("utf8").replace(/^encrypted:/, ""),
    };

    const first = createSecretService({ userDataPath: dir, safeStorage });
    first.setApiKey("sk-secure");

    const rawSecretFile = readFileSync(join(dir, "secrets.json"), "utf8");
    expect(rawSecretFile).not.toContain("sk-secure");
    expect(rawSecretFile).toContain("apiKeyEncrypted");
    expect(first.getStorageStatus()).toEqual({ saved: true, secure: true });

    const second = createSecretService({ userDataPath: dir, safeStorage });
    expect(second.getApiKey()).toBe("sk-secure");
    expect(second.getStorageStatus()).toEqual({ saved: true, secure: true });
  });

  it("reports weak local storage when safe storage is unavailable", () => {
    dir = mkdtempSync(join(tmpdir(), "petdex-secrets-"));
    const service = createSecretService({
      userDataPath: dir,
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (value: string) => Buffer.from(value, "utf8"),
        decryptString: (value: Buffer) => value.toString("utf8"),
      },
    });

    service.setApiKey("sk-weak");

    expect(service.getApiKey()).toBe("sk-weak");
    expect(service.getStorageStatus()).toEqual({ saved: true, secure: false });
  });
});