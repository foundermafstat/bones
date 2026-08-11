import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFighterCombatProfile, compileRig } from "../packages/compiler/dist/index.js";
import { validateFighterCombatProfile, validateFighterRosterManifest, validateRigProject } from "../packages/schema/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = join(repoRoot, "apps/editor/public/assets/fighters");
const baseProjectPath = join(repoRoot, "apps/editor/public/assets/dark-assassin/dark-assassin.source.rig.json");
const checkOnly = process.argv.includes("--check");
const requested = process.argv.find((argument) => argument.startsWith("--fighter="))?.split("=")[1] ?? "pulse";

const BODY_PROMPT = "Technical orthographic three-quarter-right cutout sheet: 14 isolated Pulse body parts, clean joint cuts, hands/forearms and feet/shins separated, flat #00FF00 background.";
const FACE_PROMPT = "Technical orthographic three-quarter-right face sheet: blank head base, four interchangeable same-angle face plates, two isolated hood accessories, flat #00FF00 background.";
const IDENTITY_PROMPT = "Production cutout-rig identity anchor for a side-view 2D fighter, orthographic three-quarter-right camera, tall athletic Pulse in cobalt/cyan/yellow streetwear.";

const fighter = {
  id: "pulse",
  name: "Pulse",
  gender: "male",
  archetype: "balanced",
  palette: ["#145CFF", "#16D9FF", "#FFD21C", "#101A35"],
  specials: ["drive_palm", "rising_guard", "breaker_kick"],
  super: "vanguard_rush"
};

if (requested !== fighter.id) {
  throw new Error(`Only the approved Pulse pilot is generated in this stage; received '${requested}'.`);
}

const movementClips = [
  "idle", "walk_forward", "walk_backward", "dash_forward", "dash_backward", "crouch", "jump_start",
  "air_neutral", "air_forward", "air_backward", "land", "turn", "intro", "victory"
];
const reactionClips = [
  "guard_high", "guard_low", "block_high", "block_low", "hurt_light", "hurt_heavy", "hurt_low",
  "hurt_air", "knockdown", "get_up", "throw_break", "death"
];
const normalClips = ["standing", "crouching", "aerial"].flatMap((stance) =>
  ["lp", "mp", "hp", "lk", "mk", "hk"].map((button) => `${stance}_${button}`)
);
const throwClips = ["throw_forward", "throw_back"];
const clipIds = [...movementClips, ...reactionClips, ...normalClips, ...throwClips, ...fighter.specials, fighter.super];
if (clipIds.length !== 50 || new Set(clipIds).size !== 50) throw new Error("Pulse clip list must contain exactly 50 unique ids.");

const standingFrames = {
  lp: { startup: 4, active: 3, recovery: 8, damage: 30 },
  mp: { startup: 6, active: 3, recovery: 12, damage: 60 },
  hp: { startup: 9, active: 4, recovery: 18, damage: 90 },
  lk: { startup: 5, active: 3, recovery: 10, damage: 35 },
  mk: { startup: 7, active: 4, recovery: 14, damage: 65 },
  hk: { startup: 11, active: 4, recovery: 20, damage: 100 }
};

const fixedClipFrames = {
  idle: 120, walk_forward: 72, walk_backward: 72, dash_forward: 32, dash_backward: 32, crouch: 30,
  jump_start: 14, air_neutral: 40, air_forward: 40, air_backward: 40, land: 16, turn: 18, intro: 90,
  victory: 100, guard_high: 30, guard_low: 30, block_high: 18, block_low: 18, hurt_light: 20,
  hurt_heavy: 34, hurt_low: 28, hurt_air: 34, knockdown: 52, get_up: 46, throw_break: 32, death: 100,
  throw_forward: 31, throw_back: 34, drive_palm: 48, rising_guard: 52, breaker_kick: 50, vanguard_rush: 120
};
for (const id of normalClips) {
  const data = standingFrames[id.split("_")[1]];
  fixedClipFrames[id] = data.startup + data.active + data.recovery;
}

const importedClipMap = {
  idle: "idle",
  walk: "walk_forward",
  run: "dash_forward",
  jump: "jump_start",
  fall: "air_neutral",
  land: "land",
  attack: "standing_hp",
  hurt: "hurt_heavy",
  die: "death",
  walk_attack: "standing_mp",
  run_attack: "standing_hk",
  jump_airborne_attack: "aerial_hp"
};

const base = JSON.parse(readFileSync(baseProjectPath, "utf8"));
const baseRig = base.rigs[0];
const setupByBone = new Map(baseRig.bones.map((bone) => [bone.id, bone.local ?? bone.transform]));
const packageRoot = join(assetsRoot, fighter.id);
const partsRoot = join(packageRoot, "parts");
const visualParts = createVisualParts();
const combatProfile = createCombatProfile();
const activeByClip = new Map();
for (const move of combatProfile.moves) {
  if (!activeByClip.has(move.clipId)) activeByClip.set(move.clipId, move.activeWindows[0]);
}
const animations = createAnimations();

const project = {
  schemaVersion: "1.0.0",
  runtimeTarget: "pixi-v8",
  id: fighter.id,
  projectId: fighter.id,
  name: fighter.name,
  units: "pixels",
  defaultFrameRate: 60,
  rigs: [{
    id: `${fighter.id}-rig`,
    name: fighter.name,
    rootBoneId: baseRig.rootBoneId,
    bones: baseRig.bones,
    parts: visualParts.map(({ manifest, ...part }) => part),
    editor: { custom: { characterKind: "human", fighterPreset: fighter.id, selectedBoneId: "bone11", selectedPartId: "torso" } }
  }],
  animations,
  poses: [{
    id: "idle_neutral",
    name: "Idle Neutral",
    rigId: `${fighter.id}-rig`,
    boneTransforms: {},
    partProperties: Object.fromEntries(["face_neutral", "face_attack", "face_hurt", "face_victory"].map((id) => [id, { visible: id === "face_neutral" }]))
  }],
  stateMachines: [{
    id: `${fighter.id}-preview-state-machine`,
    name: `${fighter.name} Preview`,
    initialStateId: "idle",
    states: [
      { id: "idle", name: "Idle", clipId: "idle" },
      { id: "walk", name: "Walk", clipId: "walk_forward" },
      { id: "dash", name: "Dash", clipId: "dash_forward" },
      { id: "crouch", name: "Crouch", clipId: "crouch" },
      { id: "jump", name: "Jump", clipId: "jump_start" },
      { id: "air", name: "Air", clipId: "air_neutral" },
      { id: "land", name: "Land", clipId: "land" },
      { id: "victory", name: "Victory", clipId: "victory" }
    ],
    transitions: [],
    parameters: []
  }],
  proceduralPresets: [],
  preview: { quality: "high", showSkeleton: false, showAnimationStateDebug: true },
  editor: {
    label: "Pulse fighter pilot",
    notes: "38-bone human cutout rig; combat data is compiled separately.",
    custom: {
      characterKind: "human",
      fighterPreset: fighter.id,
      sourceRig: "checked-in 38-bone animation source",
      importedSourceClips: Object.keys(importedClipMap),
      visualPartCount: 21,
      animationClipCount: 50
    }
  }
};

const rigValidation = validateRigProject(project);
if (!rigValidation.ok) throw new Error(formatIssues("Pulse rig validation failed", rigValidation.errors));
const combatValidation = validateFighterCombatProfile(combatProfile, project);
if (!combatValidation.ok) throw new Error(formatIssues("Pulse combat validation failed", combatValidation.errors));

const compiled = compileRig(project);
const compiledCombat = compileFighterCombatProfile(combatProfile, compiled);
const packageManifest = createPackageManifest();
const rosterManifest = {
  formatVersion: "1.0.0",
  tickRate: 60,
  buttons: ["LP", "MP", "HP", "LK", "MK", "HK"],
  fighters: [packageManifest]
};
const rosterValidation = validateFighterRosterManifest(rosterManifest);
if (!rosterValidation.ok) throw new Error(formatIssues("Pulse roster validation failed", rosterValidation.errors));

const outputs = new Map([
  [join(packageRoot, `${fighter.id}.source.rig.json`), project],
  [join(packageRoot, `${fighter.id}.compiled.json`), compiled],
  [join(packageRoot, `${fighter.id}.combat.json`), combatProfile],
  [join(packageRoot, `${fighter.id}.combat.compiled.json`), compiledCombat],
  [join(packageRoot, "manifest.json"), packageManifest],
  [join(assetsRoot, "roster.manifest.json"), rosterManifest]
]);

validateReleaseGates(outputs);
for (const [path, value] of outputs) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) throw new Error(`Generated output is stale: ${path}`);
  } else {
    writeFileSync(path, content);
  }
}

console.log(`${checkOnly ? "Checked" : "Generated"} ${fighter.name}: ${animations.length} clips, ${visualParts.length} parts, ${combatProfile.moves.length} combat moves.`);

function createVisualParts() {
  const definitions = [
    part("accessory_back", "bone11", 0, 105, 140, "vertical", 78, 0, false),
    part("thigh_back", "bone2", 1, 155, 72, "vertical", -15),
    part("shin_back", "bone3", 2, 130, 58, "vertical", -10),
    part("foot_back", "bone4", 3, 100, 48, "horizontal", -6),
    part("upper_arm_back", "bone13", 4, 150, 62, "vertical", -4),
    part("forearm_back", "bone18", 5, 160, 48, "vertical", -4),
    part("hand_back", "bone19", 6, 102, 48, "horizontal", -4),
    part("pelvis", "bone10", 7, 105, 150),
    part("torso", "bone11", 8, 175, 165),
    part("head_base", "bone12", 9, 190, 150),
    part("face_neutral", "bone12", 10, 128, 95, "vertical", 35, 25),
    part("face_attack", "bone12", 11, 128, 95, "vertical", 35, 25, false),
    part("face_hurt", "bone12", 12, 128, 95, "vertical", 35, 25, false),
    part("face_victory", "bone12", 13, 128, 95, "vertical", 35, 25, false),
    part("thigh_front", "bone6", 14, 144, 72, "vertical", -15),
    part("shin_front", "bone7", 15, 136, 58, "vertical", -10),
    part("foot_front", "bone8", 16, 100, 48, "horizontal", -6),
    part("upper_arm_front", "bone14", 17, 100, 62, "vertical", -4),
    part("forearm_front", "bone15", 18, 150, 48, "vertical", -4),
    part("hand_front", "bone16", 19, 102, 48, "horizontal", -4),
    part("accessory_front", "bone11", 20, 92, 130, "vertical", 80, 0, false)
  ];
  for (const definition of definitions) {
    const path = join(partsRoot, `${definition.id}.png`);
    if (!existsSync(path)) throw new Error(`Missing visual part ${path}`);
  }
  return definitions;
}

function part(id, binding, drawOrder, length, width, orientation = "vertical", offsetX = 0, offsetY = 0, visible = true) {
  const texture = `/assets/fighters/${fighter.id}/parts/${id}.png`;
  const sourceSize = pngSize(join(partsRoot, `${id}.png`));
  const vertices = [offsetX, offsetY - width / 2, offsetX + length, offsetY - width / 2, offsetX + length, offsetY + width / 2, offsetX, offsetY + width / 2];
  const uvs = orientation === "horizontal" ? [0, 0, 1, 0, 1, 1, 0, 1] : [0, 1, 0, 0, 1, 0, 1, 1];
  const skin = [];
  for (let index = 0; index < vertices.length; index += 2) {
    skin.push([{ boneId: binding, x: vertices[index], y: vertices[index + 1], weight: 1 }]);
  }
  const prompt = ["head_base", "face_neutral", "face_attack", "face_hurt", "face_victory", "accessory_back", "accessory_front"].includes(id) ? FACE_PROMPT : BODY_PROMPT;
  return {
    id,
    name: title(id),
    boneId: "root",
    type: "mesh",
    drawOrder,
    visible,
    opacity: 1,
    local: identity(),
    mesh: { vertices, indices: [0, 1, 2, 0, 2, 3], uvs, texture, skin },
    editor: { custom: { pivot: [offsetX, offsetY], boneBinding: binding, sourceSize, sourcePrompt: prompt, assetPath: texture } },
    manifest: { id, file: `parts/${id}.png`, boneBinding: binding, drawOrder, pivot: [offsetX, offsetY], prompt }
  };
}

function createAnimations() {
  const importedByTarget = new Map();
  for (const source of base.animations) {
    const target = importedClipMap[source.id];
    if (target) importedByTarget.set(target, retimeImportedClip(source, target, fixedClipFrames[target]));
  }
  if (importedByTarget.size !== 12) throw new Error(`Expected all 12 source animations, imported ${importedByTarget.size}.`);
  return clipIds.map((id) => importedByTarget.get(id) ?? createPoseClip(id, fixedClipFrames[id]));
}

function retimeImportedClip(source, id, frames) {
  const duration = frameTime(frames);
  const tracks = source.tracks
    .filter((track) => track.property !== "deform" && track.property !== "drawOrder")
    .map((track) => ({
      ...track,
      id: track.id.replace(`${source.id}.`, `${id}.`),
      keyframes: dedupeKeyframes(track.keyframes.map((keyframe) => ({
        ...keyframe,
        time: frameTime(Math.round((keyframe.time / source.duration) * frames))
      })))
    }))
    .filter((track) => !constantTrack(track));
  return finishClip({
    id,
    name: title(id),
    duration,
    frameRate: 60,
    loop: ["idle", "walk_forward", "dash_forward", "air_neutral"].includes(id),
    tracks,
    tags: tagsForClip(id),
    editor: { custom: { importedFrom: source.id, normalizedTo60Hz: true, deformAndDrawOrderRemoved: true } }
  });
}

function createPoseClip(id, frames) {
  const times = [0, Math.max(1, Math.round(frames * 0.28)), Math.max(2, Math.round(frames * 0.58)), frames];
  const tracks = mergeMotions(recipeFor(id)).map(({ bone, property, values }) => transformTrack(id, bone, property, times, values));
  return finishClip({
    id,
    name: title(id),
    duration: frameTime(frames),
    frameRate: 60,
    loop: ["walk_backward"].includes(id),
    tracks,
    tags: tagsForClip(id),
    editor: { custom: { generatedBy: "deterministic-pose-recipe-v1", normalizedTo60Hz: true } }
  });
}

function mergeMotions(motions) {
  const merged = new Map();
  for (const entry of motions) {
    const key = `${entry.bone}:${entry.property}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...entry, values: [...entry.values] });
      continue;
    }
    previous.values = previous.values.map((value, index) => value + entry.values[index]);
  }
  return [...merged.values()];
}

function finishClip(clip) {
  const expression = expressionForClip(clip.id);
  const tracks = [...clip.tracks, ...faceTracks(clip.id, expression)];
  const active = activeByClip.get(clip.id);
  const events = active ? [
    { time: frameTime(active[0]), type: "combat.active.start", category: "gameplay", payload: { clipId: clip.id } },
    { time: frameTime(active[1]), type: "combat.active.end", category: "gameplay", payload: { clipId: clip.id } }
  ] : [];
  return {
    ...clip,
    tracks,
    events,
    markers: [{ id: `${clip.id}-end`, time: clip.duration, label: clip.loop ? "Loop" : "End" }]
  };
}

function recipeFor(id) {
  if (id === "idle") return [motion("bone11", "y", [0, -3, 2, 0]), motion("bone12", "rotation", [0, 0.03, -0.02, 0])];
  if (id.includes("walk") || id.includes("dash")) return locomotionRecipe(id.includes("backward") ? -1 : 1, id.includes("dash") ? 1.4 : 1);
  if (id === "crouch") return crouchRecipe();
  if (id.startsWith("crouching")) return [...crouchRecipe(), ...attackRecipe(id)];
  if (id.includes("guard") || id.includes("block") || id === "throw_break") return guardRecipe(id.includes("low") ? 0.35 : -0.2);
  if (id.startsWith("hurt") || id === "knockdown" || id === "death") return reactionRecipe(id);
  if (id === "air_forward" || id === "air_backward") return airRecipe(id === "air_backward" ? -1 : 1);
  if (id.startsWith("aerial")) return [...airRecipe(0), ...attackRecipe(id)];
  if (id === "jump_start") return [motion("bone", "y", [0, 28, -24, 0]), motion("bone2", "rotation", [0, 0.35, -0.25, 0]), motion("bone6", "rotation", [0, -0.3, 0.2, 0])];
  if (id === "land") return [motion("bone", "y", [0, 35, 18, 0]), motion("bone10", "rotation", [0, 0.18, 0.08, 0])];
  if (id === "get_up") return [motion("bone", "rotation", [0, 0.9, 0.35, 0]), motion("bone", "y", [0, 60, 28, 0])];
  if (id.startsWith("throw_")) return [motion("bone10", "rotation", [0, -0.2, 0.35, 0]), motion("bone15", "rotation", [0, -0.8, -1.25, 0]), motion("bone16", "rotation", [0, -0.4, -0.9, 0])];
  if (id === "drive_palm") return [motion("bone10", "rotation", [0, -0.2, -0.38, 0]), motion("bone15", "rotation", [0, -0.65, -1.35, 0]), motion("bone16", "rotation", [0, -0.55, -1.2, 0]), motion("bone", "x", [0, 10, 42, 0])];
  if (id === "rising_guard") return [motion("bone", "y", [0, 18, -52, 0]), motion("bone15", "rotation", [0, -0.5, -1.1, 0]), motion("bone18", "rotation", [0, 0.5, 1.0, 0])];
  if (id === "breaker_kick") return [motion("bone10", "rotation", [0, 0.25, -0.2, 0]), motion("bone6", "rotation", [0, -0.7, -1.5, 0]), motion("bone7", "rotation", [0, 0.35, -0.3, 0]), motion("bone", "x", [0, 4, 30, 0])];
  if (id === "vanguard_rush") return [motion("bone", "x", [0, 45, 135, 0]), motion("bone", "y", [0, -10, -32, 0]), motion("bone15", "rotation", [0, -0.9, -1.6, 0]), motion("bone18", "rotation", [0, 0.8, 1.35, 0]), motion("bone6", "rotation", [0, -0.55, -1.25, 0])];
  if (id === "victory" || id === "intro") return [motion("bone15", "rotation", [0, -0.4, -1.05, 0]), motion("bone18", "rotation", [0, 0.35, 0.95, 0]), motion("bone12", "rotation", [0, -0.05, 0.08, 0])];
  if (id === "turn") return [motion("bone10", "rotation", [0, 0.25, -0.25, 0]), motion("bone12", "rotation", [0, -0.2, 0.2, 0])];
  return attackRecipe(id);
}

function crouchRecipe() {
  return [
    motion("bone", "y", [0, 10, 18, 0]),
    motion("bone10", "rotation", [0, 0.12, 0.24, 0]),
    motion("bone2", "rotation", [0, -0.22, -0.38, 0]),
    motion("bone3", "rotation", [0, 0.36, 0.66, 0]),
    motion("bone6", "rotation", [0, 0.22, 0.38, 0]),
    motion("bone7", "rotation", [0, -0.36, -0.66, 0])
  ];
}

function airRecipe(direction) {
  return [
    motion("bone", "x", [0, 18 * direction, 34 * direction, 0]),
    motion("bone", "y", [0, -18, -30, 0]),
    motion("bone2", "rotation", [0, 0.35, 0.55, 0]),
    motion("bone3", "rotation", [0, -0.5, -0.75, 0]),
    motion("bone6", "rotation", [0, -0.3, -0.5, 0]),
    motion("bone7", "rotation", [0, 0.45, 0.7, 0])
  ];
}

function attackRecipe(id) {
  const button = id.split("_").at(-1);
  const strength = { lp: 0.55, mp: 0.85, hp: 1.2, lk: 0.65, mk: 1, hk: 1.35 }[button] ?? 0.65;
  if (button?.endsWith("k")) return [motion("bone6", "rotation", [0, -0.25 * strength, -0.9 * strength, 0]), motion("bone7", "rotation", [0, 0.2, -0.25 * strength, 0]), motion("bone10", "rotation", [0, 0.1, -0.12, 0])];
  return [motion("bone15", "rotation", [0, -0.35 * strength, -1.05 * strength, 0]), motion("bone16", "rotation", [0, -0.25, -0.7 * strength, 0]), motion("bone10", "rotation", [0, -0.08, -0.16 * strength, 0])];
}

function locomotionRecipe(direction, speed) {
  return [
    motion("bone", "x", [0, 10 * direction * speed, 22 * direction * speed, 0]),
    motion("bone2", "rotation", [0, 0.45 * speed, -0.45 * speed, 0]),
    motion("bone6", "rotation", [0, -0.45 * speed, 0.45 * speed, 0]),
    motion("bone15", "rotation", [0, -0.25 * speed, 0.25 * speed, 0]),
    motion("bone18", "rotation", [0, 0.25 * speed, -0.25 * speed, 0])
  ];
}

function guardRecipe(low) {
  return [motion("bone15", "rotation", [0, -0.7 + low, -0.9 + low, 0]), motion("bone16", "rotation", [0, -0.5, -0.75, 0]), motion("bone18", "rotation", [0, 0.45 - low, 0.75 - low, 0])];
}

function reactionRecipe(id) {
  const heavy = id === "hurt_heavy" || id === "knockdown" || id === "death" ? 1 : 0.55;
  return [motion("bone", "x", [0, -12 * heavy, -38 * heavy, 0]), motion("bone10", "rotation", [0, 0.18 * heavy, 0.55 * heavy, 0]), motion("bone12", "rotation", [0, 0.12, 0.3 * heavy, 0]), motion("bone", "y", [0, 4, 28 * heavy, 0])];
}

function motion(bone, property, values) {
  return { bone, property, values };
}

function transformTrack(clipId, boneId, property, frames, deltas) {
  const baseValue = setupByBone.get(boneId)?.[property] ?? (property.startsWith("scale") ? 1 : 0);
  return {
    id: `${clipId}.${boneId}.transform.${property}`,
    target: { kind: "bone", id: boneId },
    property: `transform.${property}`,
    keyframes: frames.map((frame, index) => ({ time: frameTime(frame), value: round(baseValue + deltas[index]), interpolation: "linear" }))
  };
}

function faceTracks(clipId, expression) {
  return ["neutral", "attack", "hurt", "victory"].map((name) => ({
    id: `${clipId}.face_${name}.visible`,
    target: { kind: "part", id: `face_${name}` },
    property: "visible",
    keyframes: [{ time: 0, value: name === expression, interpolation: "step" }]
  }));
}

function expressionForClip(id) {
  if (id.includes("hurt") || id === "knockdown" || id === "death" || id.includes("block")) return "hurt";
  if (id === "victory" || id === "intro") return "victory";
  if (normalClips.includes(id) || throwClips.includes(id) || fighter.specials.includes(id) || id === fighter.super) return "attack";
  return "neutral";
}

function tagsForClip(id) {
  if (movementClips.includes(id)) return ["movement", id];
  if (reactionClips.includes(id)) return ["reaction", id];
  if (normalClips.includes(id)) return ["normal", id.split("_")[0], id.split("_")[1]];
  if (throwClips.includes(id)) return ["throw", id];
  return [id === fighter.super ? "super" : "special", id];
}

function createCombatProfile() {
  const moves = [];
  for (const stance of ["standing", "crouching", "aerial"]) {
    for (const button of ["lp", "mp", "hp", "lk", "mk", "hk"]) {
      const data = standingFrames[button];
      const id = `${stance}_${button}`;
      const hitLevel = stance === "aerial" ? "overhead" : stance === "crouching" && button.endsWith("k") ? "low" : "mid";
      moves.push(moveDefinition({
        id,
        clipId: id,
        stance: stance === "aerial" ? "airborne" : stance,
        motion: stance === "standing" ? [5] : stance === "crouching" ? [2] : [8],
        buttons: [button.toUpperCase()],
        ...data,
        hitLevel,
        knockdown: id === "crouching_hk"
      }));
    }
  }
  moves.push(moveDefinition({ id: "throw_forward", clipId: "throw_forward", stance: "standing", motion: [6], buttons: ["LP", "LK"], startup: 5, active: 2, recovery: 24, damage: 120, hitLevel: "throw", knockdown: true }));
  moves.push(moveDefinition({ id: "throw_back", clipId: "throw_back", stance: "standing", motion: [4], buttons: ["LP", "LK"], startup: 6, active: 2, recovery: 26, damage: 120, hitLevel: "throw", knockdown: true }));
  const specialInputs = {
    drive_palm: { motion: [2, 3, 6], buttons: ["LP", "MP", "HP"] },
    rising_guard: { motion: [6, 2, 3], buttons: ["LP", "MP", "HP"] },
    breaker_kick: { motion: [2, 1, 4], buttons: ["LK", "MK", "HK"] }
  };
  const variants = [
    { suffix: "l", startup: 7, active: 3, recovery: 16, damage: 75 },
    { suffix: "m", startup: 9, active: 4, recovery: 19, damage: 105 },
    { suffix: "h", startup: 12, active: 5, recovery: 23, damage: 135 }
  ];
  for (const special of fighter.specials) {
    variants.forEach((variant, index) => moves.push(moveDefinition({
      id: `${special}_${variant.suffix}`,
      clipId: special,
      stance: special === "rising_guard" ? "standing" : "standing",
      motion: specialInputs[special].motion,
      buttons: [specialInputs[special].buttons[index]],
      ...variant,
      hitLevel: special === "breaker_kick" ? "low" : "mid",
      knockdown: variant.suffix === "h"
    })));
  }
  moves.push(moveDefinition({ id: fighter.super, clipId: fighter.super, stance: "standing", motion: [2, 3, 6, 2, 3, 6], buttons: ["HP", "HK"], startup: 12, active: 12, recovery: 42, damage: 320, hitLevel: "mid", knockdown: true, meterCost: 1000 }));
  return {
    formatVersion: "1.0.0",
    fighterId: fighter.id,
    rigId: `${fighter.id}-rig`,
    tickRate: 60,
    stats: { maxHealth: 1000, walkForward: 4.2, walkBackward: 3.5, dashForward: 9, dashBackward: 7.5, jumpVelocityY: -15, gravity: 0.85, weight: 1 },
    moves
  };
}

function moveDefinition(options) {
  const active = [options.startup, options.startup + options.active];
  const total = options.startup + options.active + options.recovery;
  const isKick = options.hitLevel !== "throw" && options.buttons.some((button) => button.endsWith("K"));
  const attackBone = isKick ? "bone8" : "bone16";
  const cancelTargets = ["drive_palm_l", "rising_guard_l", "breaker_kick_l", fighter.super];
  return {
    id: options.id,
    name: title(options.id),
    clipId: options.clipId,
    stance: options.stance,
    command: { motion: options.motion, buttons: options.buttons },
    startupFrames: options.startup,
    activeWindows: [active],
    recoveryFrames: options.recovery,
    damage: options.damage,
    hitLevel: options.hitLevel,
    hitstopFrames: options.damage >= 120 ? 12 : options.damage >= 80 ? 9 : 6,
    hitstunFrames: Math.max(12, Math.round(options.damage * 0.24)),
    blockstunFrames: Math.max(8, Math.round(options.damage * 0.15)),
    knockback: { x: options.damage >= 120 ? 9 : 5, y: options.knockdown ? -6 : -1 },
    meterGain: options.meterCost ? 0 : Math.max(10, Math.round(options.damage * 0.35)),
    meterCost: options.meterCost ?? 0,
    knockdown: options.knockdown ?? false,
    boxes: [
      { kind: "hurt", frames: [0, total], boneId: "bone11", rect: { x: -55, y: -110, width: 110, height: 220 } },
      { kind: options.hitLevel === "throw" ? "throw" : "hit", frames: active, boneId: attackBone, rect: { x: 8, y: -30, width: isKick ? 96 : 94, height: 60 } }
    ],
    cancelWindows: normalClips.includes(options.clipId) ? [{ frames: [active[1], Math.min(total, active[1] + 6)], into: cancelTargets, condition: "hit-or-block" }] : [],
    tags: [options.clipId === fighter.super ? "super" : fighter.specials.includes(options.clipId) ? "special" : options.hitLevel === "throw" ? "throw" : "normal"]
  };
}

function createPackageManifest() {
  return {
    id: fighter.id,
    name: fighter.name,
    gender: fighter.gender,
    archetype: fighter.archetype,
    palette: fighter.palette,
    sourceRig: `${fighter.id}.source.rig.json`,
    compiledRig: `${fighter.id}.compiled.json`,
    combatProfile: `${fighter.id}.combat.json`,
    compiledCombatProfile: `${fighter.id}.combat.compiled.json`,
    partsDirectory: "parts/",
    identityAnchor: "source-art/identity-anchor.png",
    partCount: 21,
    clipCount: 50,
    visualParts: visualParts.map((part) => part.manifest),
    prompts: { identityAnchor: IDENTITY_PROMPT, bodyPartsSheet: BODY_PROMPT, faceAccessorySheet: FACE_PROMPT }
  };
}

function validateReleaseGates(outputs) {
  const sourceText = JSON.stringify(project);
  if (sourceText.includes("/assets/dark-assassin") || sourceText.includes("DarkAssassin.png")) throw new Error("Pulse package references original textures.");
  const partFiles = readdirSync(partsRoot).filter((name) => name.endsWith(".png"));
  if (partFiles.length !== 21) throw new Error(`Expected 21 PNG parts, found ${partFiles.length}.`);
  const imageBytes = partFiles.reduce((total, name) => total + statSync(join(partsRoot, name)).size, 0);
  if (imageBytes > 4 * 1024 * 1024) throw new Error(`Pulse parts exceed 4 MiB (${imageBytes} bytes).`);
  const compiledPath = join(packageRoot, `${fighter.id}.compiled.json`);
  const compiledObject = outputs.get(compiledPath);
  const gzipBytes = gzipSync(Buffer.from(JSON.stringify(compiledObject))).length;
  if (gzipBytes > 200 * 1024) throw new Error(`Pulse compiled runtime exceeds 200 KiB gzip (${gzipBytes} bytes).`);
}

function pngSize(path) {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error(`Not a PNG: ${path}`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function dedupeKeyframes(keyframes) {
  const byTime = new Map(keyframes.map((keyframe) => [keyframe.time, keyframe]));
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function constantTrack(track) {
  if (track.keyframes.length < 2) return false;
  const first = track.keyframes[0].value;
  return typeof first === "number" && track.keyframes.every((keyframe) => typeof keyframe.value === "number" && Math.abs(keyframe.value - first) <= 0.001);
}

function identity() {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
}

function frameTime(frame) {
  return round(frame / 60);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function title(value) {
  return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatIssues(label, issues) {
  return `${label}:\n${issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`;
}
