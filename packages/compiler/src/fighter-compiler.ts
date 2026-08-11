import { validateFighterCombatProfile, type FighterCombatProfileV1, type ValidationIssue } from "@bones/schema";
import {
  FIGHTER_COMBAT_COMPILED_FORMAT_VERSION,
  type CompiledFighterCombatProfileV1
} from "./fighter-types.js";
import type { CompiledRigProjectV1, NumericId } from "./types.js";

export class FighterCombatCompileError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "FighterCombatCompileError";
    this.issues = issues;
  }
}

export function compileFighterCombatProfile(
  input: unknown,
  compiledRig: CompiledRigProjectV1
): CompiledFighterCombatProfileV1 {
  const validation = validateFighterCombatProfile(input);
  if (!validation.ok) throw new FighterCombatCompileError(validation.errors);
  const profile = validation.value;
  const issues = validateReferences(profile, compiledRig);
  if (issues.length) throw new FighterCombatCompileError(issues);

  const sortedMoveIds = profile.moves.map((move) => move.id).sort((left, right) => left.localeCompare(right));
  const moveLookup = Object.fromEntries(sortedMoveIds.map((id, index) => [id, index]));
  const movesById = new Map(profile.moves.map((move) => [move.id, move]));

  return {
    compiledFormatVersion: FIGHTER_COMBAT_COMPILED_FORMAT_VERSION,
    sourceFormatVersion: profile.formatVersion,
    fighterId: profile.fighterId,
    rig: required(compiledRig.lookups.rigs, profile.rigId, "rig"),
    tickRate: 60,
    stats: profile.stats,
    moves: sortedMoveIds.map((moveId) => {
      const move = movesById.get(moveId)!;
      return {
        id: moveLookup[move.id]!,
        clip: required(compiledRig.lookups.animations, move.clipId, "clip"),
        stance: move.stance,
        command: move.command,
        startupFrames: move.startupFrames,
        activeWindows: move.activeWindows,
        recoveryFrames: move.recoveryFrames,
        damage: move.damage,
        hitLevel: move.hitLevel,
        hitstopFrames: move.hitstopFrames,
        hitstunFrames: move.hitstunFrames,
        blockstunFrames: move.blockstunFrames,
        knockback: move.knockback,
        meterGain: move.meterGain,
        meterCost: move.meterCost,
        knockdown: move.knockdown ?? false,
        boxes: move.boxes.map((box) => ({
          kind: box.kind,
          frames: box.frames,
          bone: required(compiledRig.lookups.bones, box.boneId, "bone"),
          rect: box.rect
        })),
        cancelWindows: move.cancelWindows.map((window) => ({
          frames: window.frames,
          into: window.into.map((target) => required(moveLookup, target, "move")),
          condition: window.condition ?? "always"
        })),
        tags: move.tags ?? []
      };
    }),
    moveLookup
  };
}

function validateReferences(profile: FighterCombatProfileV1, compiledRig: CompiledRigProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (compiledRig.lookups.rigs[profile.rigId] === undefined) {
    issues.push({ path: "$.rigId", message: `Rig '${profile.rigId}' is not present in the compiled rig.` });
  }
  const moveIds = new Set(profile.moves.map((move) => move.id));
  profile.moves.forEach((move, moveIndex) => {
    if (compiledRig.lookups.animations[move.clipId] === undefined) {
      issues.push({ path: `$.moves[${moveIndex}].clipId`, message: `Clip '${move.clipId}' is not present in the compiled rig.` });
    }
    move.boxes.forEach((box, boxIndex) => {
      if (compiledRig.lookups.bones[box.boneId] === undefined) {
        issues.push({ path: `$.moves[${moveIndex}].boxes[${boxIndex}].boneId`, message: `Bone '${box.boneId}' is not present in the compiled rig.` });
      }
    });
    move.cancelWindows.forEach((window, windowIndex) => {
      window.into.forEach((target, targetIndex) => {
        if (!moveIds.has(target)) {
          issues.push({
            path: `$.moves[${moveIndex}].cancelWindows[${windowIndex}].into[${targetIndex}]`,
            message: `Cancel target '${target}' is not present in the combat profile.`
          });
        }
      });
    });
  });
  return issues;
}

function required(lookup: Readonly<Record<string, NumericId>>, id: string, kind: string): NumericId {
  const value = lookup[id];
  if (value === undefined) throw new Error(`Missing ${kind} '${id}'.`);
  return value;
}
