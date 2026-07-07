export interface PetAnimationDefinition {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface PetManifest {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  animations: Record<string, PetAnimationDefinition>;
}

export type PetSkinSource = "bundled" | "local";

export interface PetSkin {
  manifest: PetManifest;
  spritesheetUrl: string;
  sourcePath?: string;
  source: PetSkinSource;
}

export interface PetSkinLoadResult {
  skin: PetSkin;
  fallbackUsed: boolean;
  warning?: string;
}

export interface PetdexCatalogPet {
  slug: string;
  displayName: string;
  kind: string;
  submittedBy: string;
  previewUrl: string;
  heat: number;
  heatLabel: string;
}

export interface PetdexCatalogResult {
  generatedAt: string;
  total: number;
  pets: PetdexCatalogPet[];
}

export interface ManagedPetSkin {
  slug: string;
  displayName: string;
  sourcePath: string;
  previewUrl: string;
  current: boolean;
}

export interface ManagedPetSkinResult {
  skins: ManagedPetSkin[];
}