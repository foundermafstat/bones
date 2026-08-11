export const FIGHTER_ROSTER_FORMAT_VERSION = "1.0.0" as const;
export const FIGHTER_COMBAT_FORMAT_VERSION = "1.0.0" as const;

export type FighterGender = "male" | "female";
export type FighterArchetype = "balanced" | "assassin" | "heavy" | "acrobat";
export type CombatButton = "LP" | "MP" | "HP" | "LK" | "MK" | "HK";
export type CombatDirection = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type CombatStance = "standing" | "crouching" | "airborne";
export type CombatHitLevel = "mid" | "low" | "overhead" | "throw";
export type CombatBoxKind = "push" | "hurt" | "hit" | "throw";
export type CombatCancelCondition = "always" | "hit" | "block" | "hit-or-block";
export type CombatFrameRange = readonly [startInclusive: number, endExclusive: number];

export interface CombatInputCommand {
  readonly motion: readonly CombatDirection[];
  readonly buttons: readonly CombatButton[];
}

export interface CombatBoxWindow {
  readonly kind: CombatBoxKind;
  readonly frames: CombatFrameRange;
  readonly boneId: string;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface CombatCancelWindow {
  readonly frames: CombatFrameRange;
  readonly into: readonly string[];
  readonly condition?: CombatCancelCondition;
}

export interface CombatMoveDefinition {
  readonly id: string;
  readonly name: string;
  readonly clipId: string;
  readonly stance: CombatStance;
  readonly command: CombatInputCommand;
  readonly startupFrames: number;
  readonly activeWindows: readonly CombatFrameRange[];
  readonly recoveryFrames: number;
  readonly damage: number;
  readonly hitLevel: CombatHitLevel;
  readonly hitstopFrames: number;
  readonly hitstunFrames: number;
  readonly blockstunFrames: number;
  readonly knockback: { readonly x: number; readonly y: number };
  readonly meterGain: number;
  readonly meterCost: number;
  readonly knockdown?: boolean;
  readonly boxes: readonly CombatBoxWindow[];
  readonly cancelWindows: readonly CombatCancelWindow[];
  readonly tags?: readonly string[];
}

export interface FighterCombatProfileV1 {
  readonly formatVersion: typeof FIGHTER_COMBAT_FORMAT_VERSION;
  readonly fighterId: string;
  readonly rigId: string;
  readonly tickRate: 60;
  readonly stats: {
    readonly maxHealth: number;
    readonly walkForward: number;
    readonly walkBackward: number;
    readonly dashForward: number;
    readonly dashBackward: number;
    readonly jumpVelocityY: number;
    readonly gravity: number;
    readonly weight: number;
  };
  readonly moves: readonly CombatMoveDefinition[];
}

export interface FighterPackageManifestV1 {
  readonly id: string;
  readonly name: string;
  readonly gender: FighterGender;
  readonly archetype: FighterArchetype;
  readonly palette: readonly string[];
  readonly sourceRig: string;
  readonly compiledRig: string;
  readonly combatProfile: string;
  readonly compiledCombatProfile: string;
  readonly partsDirectory: string;
  readonly identityAnchor: string;
  readonly partCount: 21;
  readonly clipCount: 50;
  readonly visualParts: readonly {
    readonly id: string;
    readonly file: string;
    readonly boneBinding: string;
    readonly drawOrder: number;
    readonly pivot: readonly [number, number];
    readonly prompt: string;
  }[];
  readonly prompts: {
    readonly identityAnchor: string;
    readonly bodyPartsSheet: string;
    readonly faceAccessorySheet: string;
  };
}

export interface FighterRosterManifestV1 {
  readonly formatVersion: typeof FIGHTER_ROSTER_FORMAT_VERSION;
  readonly tickRate: 60;
  readonly buttons: readonly CombatButton[];
  readonly fighters: readonly FighterPackageManifestV1[];
}
