import {
  FIGHTER_COMBAT_FORMAT_VERSION,
  FIGHTER_ROSTER_FORMAT_VERSION,
  type CombatFrameRange,
  type FighterCombatProfileV1,
  type FighterRosterManifestV1
} from "./fighter.js";
import type { RigProject } from "./types.js";
import type { ValidationIssue, ValidationResult } from "./validate.js";

const buttons = new Set(["LP", "MP", "HP", "LK", "MK", "HK"]);
const stances = new Set(["standing", "crouching", "airborne"]);
const hitLevels = new Set(["mid", "low", "overhead", "throw"]);
const boxKinds = new Set(["push", "hurt", "hit", "throw"]);
const cancelConditions = new Set(["always", "hit", "block", "hit-or-block"]);
const genders = new Set(["male", "female"]);
const archetypes = new Set(["balanced", "assassin", "heavy", "acrobat"]);

export function validateFighterRosterManifest(input: unknown): ValidationResult<FighterRosterManifestV1> {
  const errors: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: "$", message: "Roster manifest must be an object." }] };
  }
  if (input.formatVersion !== FIGHTER_ROSTER_FORMAT_VERSION) {
    errors.push({ path: "$.formatVersion", message: "Unsupported roster formatVersion." });
  }
  if (input.tickRate !== 60) errors.push({ path: "$.tickRate", message: "Roster must use a 60 Hz tick rate." });
  if (!Array.isArray(input.buttons) || input.buttons.length !== 6 || new Set(input.buttons).size !== 6 || input.buttons.some((button) => !buttons.has(String(button)))) {
    errors.push({ path: "$.buttons", message: "Roster must declare the six unique combat buttons." });
  }
  if (!Array.isArray(input.fighters) || input.fighters.length === 0) {
    errors.push({ path: "$.fighters", message: "Roster must contain at least one fighter package." });
  } else {
    const ids = new Set<string>();
    input.fighters.forEach((fighter, index) => {
      const path = `$.fighters[${index}]`;
      if (!isRecord(fighter)) {
        errors.push({ path, message: "Fighter package must be an object." });
        return;
      }
      nonEmptyString(fighter.id, `${path}.id`, errors);
      nonEmptyString(fighter.name, `${path}.name`, errors);
      if (typeof fighter.id === "string") {
        if (ids.has(fighter.id)) errors.push({ path: `${path}.id`, message: `Duplicate fighter id '${fighter.id}'.` });
        ids.add(fighter.id);
      }
      if (!genders.has(String(fighter.gender))) errors.push({ path: `${path}.gender`, message: "Unsupported fighter gender." });
      if (!archetypes.has(String(fighter.archetype))) errors.push({ path: `${path}.archetype`, message: "Unsupported fighter archetype." });
      if (!Array.isArray(fighter.palette) || fighter.palette.length < 3 || fighter.palette.some((color) => typeof color !== "string" || !color)) {
        errors.push({ path: `${path}.palette`, message: "Fighter palette must contain at least three colors." });
      }
      for (const field of ["sourceRig", "compiledRig", "combatProfile", "compiledCombatProfile", "partsDirectory", "identityAnchor"] as const) {
        nonEmptyString(fighter[field], `${path}.${field}`, errors);
      }
      if (fighter.partCount !== 21) errors.push({ path: `${path}.partCount`, message: "Fighter package must contain 21 visual parts." });
      if (fighter.clipCount !== 50) errors.push({ path: `${path}.clipCount`, message: "Fighter package must contain 50 clips." });
      if (!Array.isArray(fighter.visualParts) || fighter.visualParts.length !== 21) {
        errors.push({ path: `${path}.visualParts`, message: "Manifest must describe exactly 21 visual parts." });
      }
      if (!isRecord(fighter.prompts)) {
        errors.push({ path: `${path}.prompts`, message: "Manifest must retain image generation prompts." });
      } else {
        for (const field of ["identityAnchor", "bodyPartsSheet", "faceAccessorySheet"] as const) {
          nonEmptyString(fighter.prompts[field], `${path}.prompts.${field}`, errors);
        }
      }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as FighterRosterManifestV1 };
}

export function validateFighterCombatProfile(
  input: unknown,
  project?: RigProject
): ValidationResult<FighterCombatProfileV1> {
  const errors: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: "$", message: "Combat profile must be an object." }] };
  }

  if (input.formatVersion !== FIGHTER_COMBAT_FORMAT_VERSION) {
    errors.push({ path: "$.formatVersion", message: "Unsupported combat profile formatVersion." });
  }
  nonEmptyString(input.fighterId, "$.fighterId", errors);
  nonEmptyString(input.rigId, "$.rigId", errors);
  if (input.tickRate !== 60) {
    errors.push({ path: "$.tickRate", message: "Combat profiles must use a 60 Hz tick rate." });
  }
  validateStats(input.stats, errors);

  const rig = project?.rigs.find((candidate) => candidate.id === input.rigId);
  if (project && !rig) {
    errors.push({ path: "$.rigId", message: `Rig '${String(input.rigId)}' does not exist.` });
  }
  const boneIds = new Set(rig?.bones.map((bone) => bone.id) ?? []);
  const clips = new Map(project?.animations?.map((clip) => [clip.id, clip]) ?? []);
  const moves = Array.isArray(input.moves) ? input.moves : [];
  if (!Array.isArray(input.moves) || input.moves.length === 0) {
    errors.push({ path: "$.moves", message: "Combat profile must contain at least one move." });
  }

  const moveIds = new Set<string>();
  moves.forEach((move, index) => {
    const path = `$.moves[${index}]`;
    if (!isRecord(move)) {
      errors.push({ path, message: "Move must be an object." });
      return;
    }
    nonEmptyString(move.id, `${path}.id`, errors);
    nonEmptyString(move.name, `${path}.name`, errors);
    nonEmptyString(move.clipId, `${path}.clipId`, errors);
    if (typeof move.id === "string") {
      if (moveIds.has(move.id)) errors.push({ path: `${path}.id`, message: `Duplicate move id '${move.id}'.` });
      moveIds.add(move.id);
    }
    if (!stances.has(String(move.stance))) errors.push({ path: `${path}.stance`, message: "Unsupported stance." });
    validateCommand(move.command, `${path}.command`, errors);
    nonNegativeInteger(move.startupFrames, `${path}.startupFrames`, errors);
    positiveInteger(move.recoveryFrames, `${path}.recoveryFrames`, errors);
    nonNegativeNumber(move.damage, `${path}.damage`, errors);
    if (!hitLevels.has(String(move.hitLevel))) errors.push({ path: `${path}.hitLevel`, message: "Unsupported hit level." });
    for (const field of ["hitstopFrames", "hitstunFrames", "blockstunFrames", "meterGain", "meterCost"] as const) {
      nonNegativeInteger(move[field], `${path}.${field}`, errors);
    }
    validateKnockback(move.knockback, `${path}.knockback`, errors);

    const clip = typeof move.clipId === "string" ? clips.get(move.clipId) : undefined;
    if (project && !clip) errors.push({ path: `${path}.clipId`, message: `Clip '${String(move.clipId)}' does not exist.` });
    const durationFrames = clip ? Math.round(clip.duration * 60) : undefined;
    if (!Array.isArray(move.activeWindows) || move.activeWindows.length === 0) {
      errors.push({ path: `${path}.activeWindows`, message: "Move must contain at least one active window." });
    } else {
      move.activeWindows.forEach((range, rangeIndex) =>
        validateRange(range, `${path}.activeWindows[${rangeIndex}]`, durationFrames, errors)
      );
    }

    if (!Array.isArray(move.boxes)) {
      errors.push({ path: `${path}.boxes`, message: "Boxes must be an array." });
    } else {
      move.boxes.forEach((box, boxIndex) => {
        const boxPath = `${path}.boxes[${boxIndex}]`;
        if (!isRecord(box)) {
          errors.push({ path: boxPath, message: "Box window must be an object." });
          return;
        }
        if (!boxKinds.has(String(box.kind))) errors.push({ path: `${boxPath}.kind`, message: "Unsupported box kind." });
        validateRange(box.frames, `${boxPath}.frames`, durationFrames, errors);
        nonEmptyString(box.boneId, `${boxPath}.boneId`, errors);
        if (project && typeof box.boneId === "string" && !boneIds.has(box.boneId)) {
          errors.push({ path: `${boxPath}.boneId`, message: `Bone '${box.boneId}' does not exist in rig '${String(input.rigId)}'.` });
        }
        validateRect(box.rect, `${boxPath}.rect`, errors);
      });
    }

    if (!Array.isArray(move.cancelWindows)) {
      errors.push({ path: `${path}.cancelWindows`, message: "Cancel windows must be an array." });
    } else {
      move.cancelWindows.forEach((window, windowIndex) => {
        const cancelPath = `${path}.cancelWindows[${windowIndex}]`;
        if (!isRecord(window)) {
          errors.push({ path: cancelPath, message: "Cancel window must be an object." });
          return;
        }
        validateRange(window.frames, `${cancelPath}.frames`, durationFrames, errors);
        if (!Array.isArray(window.into) || window.into.length === 0 || window.into.some((id) => typeof id !== "string" || !id)) {
          errors.push({ path: `${cancelPath}.into`, message: "Cancel window must contain move ids." });
        }
        if (window.condition !== undefined && !cancelConditions.has(String(window.condition))) {
          errors.push({ path: `${cancelPath}.condition`, message: "Unsupported cancel condition." });
        }
      });
    }
  });

  moves.forEach((move, moveIndex) => {
    if (!isRecord(move) || !Array.isArray(move.cancelWindows)) return;
    move.cancelWindows.forEach((window, windowIndex) => {
      if (!isRecord(window) || !Array.isArray(window.into)) return;
      window.into.forEach((target, targetIndex) => {
        if (typeof target === "string" && !moveIds.has(target)) {
          errors.push({
            path: `$.moves[${moveIndex}].cancelWindows[${windowIndex}].into[${targetIndex}]`,
            message: `Cancel target '${target}' does not exist.`
          });
        }
      });
    });
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as FighterCombatProfileV1 };
}

function validateStats(input: unknown, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path: "$.stats", message: "Stats must be an object." });
    return;
  }
  for (const field of ["maxHealth", "walkForward", "walkBackward", "dashForward", "dashBackward", "gravity", "weight"] as const) {
    positiveNumber(input[field], `$.stats.${field}`, errors);
  }
  number(input.jumpVelocityY, "$.stats.jumpVelocityY", errors);
}

function validateCommand(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Command must be an object." });
    return;
  }
  if (!Array.isArray(input.motion) || input.motion.length === 0 || input.motion.some((value) => !Number.isInteger(value) || value < 1 || value > 9)) {
    errors.push({ path: `${path}.motion`, message: "Motion must use facing-relative numpad directions 1-9." });
  }
  if (!Array.isArray(input.buttons) || input.buttons.length === 0 || input.buttons.some((value) => !buttons.has(String(value)))) {
    errors.push({ path: `${path}.buttons`, message: "Command must contain valid combat buttons." });
  }
}

function validateRange(input: unknown, path: string, durationFrames: number | undefined, errors: ValidationIssue[]): void {
  if (!Array.isArray(input) || input.length !== 2 || !input.every(Number.isInteger)) {
    errors.push({ path, message: "Frame range must be a two-integer half-open range." });
    return;
  }
  const [start, end] = input as unknown as CombatFrameRange;
  if (start < 0 || end <= start) errors.push({ path, message: "Frame range must satisfy 0 <= start < end." });
  if (durationFrames !== undefined && end > durationFrames) {
    errors.push({ path, message: `Frame range exceeds clip duration (${durationFrames} frames).` });
  }
}

function validateKnockback(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Knockback must be an object." });
    return;
  }
  number(input.x, `${path}.x`, errors);
  number(input.y, `${path}.y`, errors);
}

function validateRect(input: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Box rect must be an object." });
    return;
  }
  number(input.x, `${path}.x`, errors);
  number(input.y, `${path}.y`, errors);
  positiveNumber(input.width, `${path}.width`, errors);
  positiveNumber(input.height, `${path}.height`, errors);
}

function nonEmptyString(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof value !== "string" || !value.trim()) errors.push({ path, message: "Expected a non-empty string." });
}

function number(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) errors.push({ path, message: "Expected a finite number." });
}

function positiveNumber(value: unknown, path: string, errors: ValidationIssue[]): void {
  number(value, path, errors);
  if (typeof value === "number" && value <= 0) errors.push({ path, message: "Expected a value greater than zero." });
}

function nonNegativeNumber(value: unknown, path: string, errors: ValidationIssue[]): void {
  number(value, path, errors);
  if (typeof value === "number" && value < 0) errors.push({ path, message: "Expected a non-negative value." });
}

function positiveInteger(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (!Number.isInteger(value) || Number(value) <= 0) errors.push({ path, message: "Expected a positive integer." });
}

function nonNegativeInteger(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (!Number.isInteger(value) || Number(value) < 0) errors.push({ path, message: "Expected a non-negative integer." });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
