import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PetPositionAnchor {
  x: number;
  y: number;
}

export interface PetPositionServiceOptions {
  userDataPath: string;
}

export interface PetPositionService {
  load(): PetPositionAnchor | undefined;
  save(anchor: PetPositionAnchor): void;
}

function readAnchor(value: unknown): PetPositionAnchor | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<PetPositionAnchor>;
  if (typeof candidate.x !== "number" || !Number.isFinite(candidate.x)
    || typeof candidate.y !== "number" || !Number.isFinite(candidate.y)) {
    return undefined;
  }

  return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
}

function tryReadJson(path: string): unknown {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8"));
    }
  } catch {
    // Missing or corrupt position file: keep the default (no saved position).
  }

  return undefined;
}

export function createPetPositionService(options: PetPositionServiceOptions): PetPositionService {
  const positionPath = join(options.userDataPath, "pet-position.json");
  mkdirSync(options.userDataPath, { recursive: true });

  let current = readAnchor(tryReadJson(positionPath));

  return {
    load() {
      return current;
    },
    save(anchor) {
      const next = readAnchor(anchor);
      if (!next) {
        return;
      }

      current = next;
      writeFileSync(positionPath, JSON.stringify(current, null, 2), "utf8");
    },
  };
}
