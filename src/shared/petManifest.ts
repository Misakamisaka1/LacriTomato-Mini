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
