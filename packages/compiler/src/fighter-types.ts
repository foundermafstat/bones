import type {
  CombatButton,
  CombatCancelCondition,
  CombatDirection,
  CombatFrameRange,
  CombatHitLevel,
  CombatStance
} from "@bones/schema";
import type { NumericId } from "./types.js";

export const FIGHTER_COMBAT_COMPILED_FORMAT_VERSION = "1.0.0" as const;

export interface CompiledCombatBoxWindowV1 {
  readonly kind: "push" | "hurt" | "hit" | "throw";
  readonly frames: CombatFrameRange;
  readonly bone: NumericId;
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface CompiledCombatCancelWindowV1 {
  readonly frames: CombatFrameRange;
  readonly into: readonly NumericId[];
  readonly condition: CombatCancelCondition;
}

export interface CompiledCombatMoveDefinitionV1 {
  readonly id: NumericId;
  readonly clip: NumericId;
  readonly stance: CombatStance;
  readonly command: { readonly motion: readonly CombatDirection[]; readonly buttons: readonly CombatButton[] };
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
  readonly knockdown: boolean;
  readonly boxes: readonly CompiledCombatBoxWindowV1[];
  readonly cancelWindows: readonly CompiledCombatCancelWindowV1[];
  readonly tags: readonly string[];
}

export interface CompiledFighterCombatProfileV1 {
  readonly compiledFormatVersion: typeof FIGHTER_COMBAT_COMPILED_FORMAT_VERSION;
  readonly sourceFormatVersion: "1.0.0";
  readonly fighterId: string;
  readonly rig: NumericId;
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
  readonly moves: readonly CompiledCombatMoveDefinitionV1[];
  readonly moveLookup: Readonly<Record<string, NumericId>>;
}
