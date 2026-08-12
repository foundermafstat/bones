import type { PathCommand } from "@bones/schema";
import pulseFighterSource from "../public/assets/fighters/pulse/pulse.source.rig.json" with { type: "json" };
import miloReporterSource from "../public/assets/mascots/milo-reporter/milo-reporter.source.rig.json" with { type: "json" };
import { fromSourceProject } from "./editorSourceProject.ts";
import {
  cleanDirtyScopes,
  createDefaultEditorIkChains,
  createEditorAppearance,
  createEditorTopology,
  createProjectIdentity,
  initialAutosaveState,
  initialEditorProject,
  type AnimationClip,
  type CharacterKind,
  type EditorProjectState,
  type Keyframe,
  type ShapePart
} from "./editorState.ts";

export type CreationTemplate = CharacterKind | "pulse" | "milo-reporter";

export const FIGHTER_PRESETS = [{ id: "pulse", name: "Pulse", archetype: "Balanced fighter" }] as const;

/**
 * Anatomy and motion reference only. The template below is original Bones 2D data;
 * no Quaternius model, texture, or animation file is redistributed.
 */
export const DOG_TEMPLATE_REFERENCE = {
  title: "Quaternius Ultimate Animated Animal Pack",
  url: "https://quaternius.com/packs/ultimateanimatedanimals.html",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/"
} as const;

export function createHumanCharacterProject(name: string): EditorProjectState {
  const project = structuredClone(initialEditorProject);
  return {
    ...project,
    ...createProjectIdentity(),
    ...createEditorAppearance(project.parts),
    ikChains: createDefaultEditorIkChains(project.bones),
    name: characterName(name, "New Human"),
    characterKind: "human"
  };
}

export function createFighterCharacterProject(preset: "pulse", name: string): EditorProjectState {
  if (preset !== "pulse") {
    throw new Error(`Unknown fighter preset '${preset}'.`);
  }
  const project = fromSourceProject(pulseFighterSource);
  return {
    ...project,
    ...createProjectIdentity(),
    name: characterName(name, "Pulse"),
    characterKind: "human"
  };
}

export function createMiloReporterProject(name: string): EditorProjectState {
  const project = fromSourceProject(miloReporterSource);
  return {
    ...project,
    ...createProjectIdentity(),
    name: characterName(name, "Milo Reporter"),
    characterKind: "cat"
  };
}

export function createCharacterProject(template: CreationTemplate, name: string): EditorProjectState {
  if (template === "pulse") return createFighterCharacterProject(template, name);
  if (template === "milo-reporter" || template === "cat") return createMiloReporterProject(name);
  return template === "dog" ? createDogCharacterProject(name) : createHumanCharacterProject(name);
}

export function createDogCharacterProject(name: string): EditorProjectState {
  const projectName = characterName(name, "New Dog");
  const hierarchy = [
    "root",
    "torso",
    "chest",
    "neck",
    "head",
    "ear",
    "tailBase",
    "tailTip",
    "hindUpperBack",
    "hindLowerBack",
    "hindPawBack",
    "foreUpperBack",
    "foreLowerBack",
    "forePawBack",
    "hindUpperFront",
    "hindLowerFront",
    "hindPawFront",
    "foreUpperFront",
    "foreLowerFront",
    "forePawFront"
  ] as const;

  const parts = [
    pathPart("torsoShape", "torso", 4, [
      { type: "M", x: -66, y: -25 },
      { type: "C", c1x: -38, c1y: -40, c2x: 34, c2y: -36, x: 66, y: -18 },
      { type: "C", c1x: 76, c1y: -4, c2x: 58, c2y: 25, x: 30, y: 28 },
      { type: "C", c1x: -6, c1y: 34, c2x: -52, c2y: 23, x: -69, y: 5 },
      { type: "C", c1x: -77, c1y: -5, c2x: -75, c2y: -18, x: -66, y: -25 },
      { type: "Z" }
    ]),
    pathPart("chestShape", "chest", 5, [
      { type: "M", x: -18, y: -23 },
      { type: "C", c1x: 5, c1y: -29, c2x: 30, c2y: -17, x: 31, y: 4 },
      { type: "C", c1x: 31, c1y: 23, c2x: 7, c2y: 31, x: -16, y: 22 },
      { type: "C", c1x: -27, c1y: 11, c2x: -28, c2y: -12, x: -18, y: -23 },
      { type: "Z" }
    ]),
    proceduralPart("neckShape", "neck", "tapered-limb", 5),
    pathPart("headShape", "head", 7, [
      { type: "M", x: -15, y: -25 },
      { type: "C", c1x: 5, c1y: -35, c2x: 32, c2y: -27, x: 39, y: -10 },
      { type: "L", x: 55, y: -3 },
      { type: "C", c1x: 60, c1y: 4, c2x: 48, c2y: 12, x: 36, y: 12 },
      { type: "C", c1x: 25, c1y: 27, c2x: -4, c2y: 29, x: -18, y: 13 },
      { type: "C", c1x: -28, c1y: 1, c2x: -25, c2y: -16, x: -15, y: -25 },
      { type: "Z" }
    ]),
    pathPart("earShape", "ear", 8, [
      { type: "M", x: -4, y: 2 },
      { type: "L", x: 5, y: -31 },
      { type: "C", c1x: 13, c1y: -17, c2x: 16, c2y: -3, x: 11, y: 9 },
      { type: "Z" }
    ]),
    proceduralPart("tailBaseShape", "tailBase", "tapered-limb", 3),
    proceduralPart("tailTipShape", "tailTip", "tapered-limb", 3),
    proceduralPart("hindUpperBackShape", "hindUpperBack", "tapered-limb", 1),
    proceduralPart("hindLowerBackShape", "hindLowerBack", "tapered-limb", 1),
    pathPart("hindPawBackShape", "hindPawBack", 1, pawPath()),
    proceduralPart("foreUpperBackShape", "foreUpperBack", "tapered-limb", 1),
    proceduralPart("foreLowerBackShape", "foreLowerBack", "tapered-limb", 1),
    pathPart("forePawBackShape", "forePawBack", 1, pawPath()),
    proceduralPart("hindUpperFrontShape", "hindUpperFront", "tapered-limb", 6),
    proceduralPart("hindLowerFrontShape", "hindLowerFront", "tapered-limb", 6),
    pathPart("hindPawFrontShape", "hindPawFront", 6, pawPath()),
    proceduralPart("foreUpperFrontShape", "foreUpperFront", "tapered-limb", 6),
    proceduralPart("foreLowerFrontShape", "foreLowerFront", "tapered-limb", 6),
    pathPart("forePawFrontShape", "forePawFront", 6, pawPath())
  ];

  const animations = createDogAnimations();
  const partMap = Object.fromEntries(parts.map((part) => [part.id, part]));

  return {
    ...createProjectIdentity(),
    name: projectName,
    characterKind: "dog",
    selectedBoneId: "torso",
    hierarchy,
    parents: {
      root: null,
      torso: "root",
      chest: "torso",
      neck: "chest",
      head: "neck",
      ear: "head",
      tailBase: "torso",
      tailTip: "tailBase",
      hindUpperBack: "torso",
      hindLowerBack: "hindUpperBack",
      hindPawBack: "hindLowerBack",
      foreUpperBack: "chest",
      foreLowerBack: "foreUpperBack",
      forePawBack: "foreLowerBack",
      hindUpperFront: "torso",
      hindLowerFront: "hindUpperFront",
      hindPawFront: "hindLowerFront",
      foreUpperFront: "chest",
      foreLowerFront: "foreUpperFront",
      forePawFront: "foreLowerFront"
    },
    bones: {
      root: transform(0, 0),
      torso: transform(0, -72),
      chest: transform(52, -2),
      neck: transform(21, -15, -0.35),
      head: transform(29, 0, 0.22),
      ear: transform(2, -20, -0.08),
      tailBase: transform(-62, -10, -2.72),
      tailTip: transform(31, 0, -0.18),
      hindUpperBack: transform(-46, 14, 1.22),
      hindLowerBack: transform(32, 0, -0.2),
      hindPawBack: transform(30, 0, -1.02),
      foreUpperBack: transform(17, 13, 1.34),
      foreLowerBack: transform(32, 0, -0.18),
      forePawBack: transform(30, 0, -1.16),
      hindUpperFront: transform(-37, 16, 1.31),
      hindLowerFront: transform(32, 0, -0.26),
      hindPawFront: transform(30, 0, -1.05),
      foreUpperFront: transform(25, 15, 1.27),
      foreLowerFront: transform(32, 0, -0.15),
      forePawFront: transform(30, 0, -1.12)
    },
    boneMetadata: {
      root: { tags: ["root"], facing: 1 },
      torso: { tags: ["body", "quadruped"] },
      head: { tags: ["head"] },
      tailBase: { tags: ["tail", "secondary-motion"] },
      tailTip: { tags: ["tail", "secondary-motion"] },
      hindUpperBack: { mirrorGroup: "hind-legs", tags: ["leg", "back-layer"] },
      hindUpperFront: { mirrorGroup: "hind-legs", tags: ["leg", "front-layer"] },
      foreUpperBack: { mirrorGroup: "fore-legs", tags: ["leg", "back-layer"] },
      foreUpperFront: { mirrorGroup: "fore-legs", tags: ["leg", "front-layer"] }
    },
    boneLengths: Object.fromEntries(hierarchy.map((boneId) => [boneId, 0])),
    topology: createEditorTopology(hierarchy, {
      root: null,
      torso: "root",
      chest: "torso",
      neck: "chest",
      head: "neck",
      ear: "head",
      tailBase: "torso",
      tailTip: "tailBase",
      hindUpperBack: "torso",
      hindLowerBack: "hindUpperBack",
      hindPawBack: "hindLowerBack",
      foreUpperBack: "chest",
      foreLowerBack: "foreUpperBack",
      forePawBack: "foreLowerBack",
      hindUpperFront: "torso",
      hindLowerFront: "hindUpperFront",
      hindPawFront: "hindLowerFront",
      foreUpperFront: "chest",
      foreLowerFront: "foreUpperFront",
      forePawFront: "foreLowerFront"
    }),
    parts: partMap,
    ...createEditorAppearance(partMap),
    ikChains: {},
    poses: {},
    poseClipboard: null,
    animations,
    timeline: {
      selectedClipId: "idle",
      selectedKeyIds: [],
      keyClipboard: [],
      autoKey: false,
      snappingFps: 60,
      virtualWindow: { startRow: 0, rowCount: 12 },
      curvePreview: { fromClipId: "jump", toClipId: "land", weight: 0.5 }
    },
    stateMachine: {
      initialStateId: "idle",
      states: ["idle", "walk", "run", "jump", "fall", "land"].map((id) => ({ id, clipId: id })),
      transitions: [
        transition("idle-walk", "idle", "walk", "absSpeed", ">", 12, 0.16),
        transition("walk-idle", "walk", "idle", "absSpeed", "<=", 8, 0.16),
        transition("walk-run", "walk", "run", "absSpeed", ">", 105, 0.12),
        transition("run-walk", "run", "walk", "absSpeed", "<=", 90, 0.14),
        transition("idle-jump", "idle", "jump", "jumpPressed", "==", true, 0.08, 10),
        transition("walk-jump", "walk", "jump", "jumpPressed", "==", true, 0.08, 10),
        transition("run-jump", "run", "jump", "jumpPressed", "==", true, 0.08, 10),
        transition("idle-fall", "idle", "fall", "grounded", "==", false, 0.1, 6),
        transition("walk-fall", "walk", "fall", "grounded", "==", false, 0.1, 6),
        transition("run-fall", "run", "fall", "grounded", "==", false, 0.1, 6),
        transition("jump-fall", "jump", "fall", "velocityY", ">", 0, 0.12, 5),
        transition("fall-land", "fall", "land", "grounded", "==", true, 0.08, 8),
        transition("land-idle", "land", "idle", "timeInState", ">", 0.28, 0.18)
      ],
      parameters: { absSpeed: 0, velocityY: 0, grounded: true, jumpPressed: false, timeInState: 0 },
      preview: { fromStateId: "idle", toStateId: "walk", weight: 0.5 }
    },
    procedural: {
      inputs: { velocityX: 0, velocityY: 0, gravity: 1, wind: 0, grounded: true, jumpStart: false, landHeavy: false },
      breathing: {
        enabled: true,
        frequency: 0.7,
        amplitude: 0.8,
        affectedBones: ["torso", "head"],
        affectedBoneTransforms: { torso: { scaleY: 0.018, y: -0.5 }, head: { y: -0.35 } }
      },
      secondaryMotion: { enabled: true, target: "tailTip", stiffness: 0.28, damping: 0.7, velocityInfluence: 0.32, gravityInfluence: 0.12, windInfluence: 0.08, maxOffset: 12 },
      squashStretch: {
        enabled: true,
        targetBone: "torso",
        landingImpactScale: 0.14,
        rules: [
          { condition: "jumpStart", scaleX: 1.08, scaleY: 0.88, duration: 0.08 },
          { condition: "landHeavy", scaleX: 1.12, scaleY: 0.84, duration: 0.12 }
        ]
      },
      footIk: {
        enabled: true,
        feet: ["hindPawBack", "forePawBack", "hindPawFront", "forePawFront"],
        footChains: [
          { footBone: "hindPawBack", shinBone: "hindLowerBack", thighBone: "hindUpperBack", raycastOffsetX: 3, raycastHeight: 16 },
          { footBone: "forePawBack", shinBone: "foreLowerBack", thighBone: "foreUpperBack", raycastOffsetX: 3, raycastHeight: 16 },
          { footBone: "hindPawFront", shinBone: "hindLowerFront", thighBone: "hindUpperFront", raycastOffsetX: 3, raycastHeight: 16 },
          { footBone: "forePawFront", shinBone: "foreLowerFront", thighBone: "foreUpperFront", raycastOffsetX: 3, raycastHeight: 16 }
        ],
        maxCorrection: 7,
        blend: 0.68
      }
    },
    dirtyScopes: structuredClone(cleanDirtyScopes),
    autosave: { ...initialAutosaveState },
    dirty: false,
    dirtyParts: []
  };
}

function createDogAnimations(): Readonly<Record<string, AnimationClip>> {
  return {
    idle: clip("idle", "Idle", 1.4, true, {
      "torso.y": [[0, -72], [0.7, -73.4], [1.4, -72]],
      "torso.scaleY": [[0, 1], [0.7, 1.018], [1.4, 1]],
      "head.rotation": [[0, 0.22], [0.7, 0.18], [1.4, 0.22]],
      "ear.rotation": [[0, -0.08], [0.7, -0.14], [1.4, -0.08]],
      "tailBase.rotation": [[0, -2.72], [0.7, -2.54], [1.4, -2.72]],
      "tailTip.rotation": [[0, -0.18], [0.7, 0.08], [1.4, -0.18]]
    }),
    walk: clip("walk", "Walk", 0.8, true, {
      "torso.y": [[0, -72], [0.2, -69], [0.4, -72], [0.6, -69], [0.8, -72]],
      "torso.rotation": [[0, -0.025], [0.4, 0.025], [0.8, -0.025]],
      "head.rotation": [[0, 0.25], [0.4, 0.18], [0.8, 0.25]],
      "tailBase.rotation": [[0, -2.82], [0.4, -2.48], [0.8, -2.82]],
      "foreUpperFront.rotation": gait(0.98, 1.27, 1.55),
      "foreLowerFront.rotation": gait(-0.34, -0.15, 0.16),
      "hindUpperBack.rotation": gait(0.94, 1.22, 1.52),
      "hindLowerBack.rotation": gait(-0.45, -0.2, 0.18),
      "foreUpperBack.rotation": gait(1.62, 1.34, 1.04),
      "foreLowerBack.rotation": gait(0.12, -0.18, -0.38),
      "hindUpperFront.rotation": gait(1.61, 1.31, 1.02),
      "hindLowerFront.rotation": gait(0.15, -0.26, -0.46)
    }, [
      { id: "walk-contact-a", time: 0, type: "footstep", category: "audio", payload: { pair: "diagonal-a" } },
      { id: "walk-contact-b", time: 0.4, type: "footstep", category: "audio", payload: { pair: "diagonal-b" } }
    ]),
    run: clip("run", "Run", 0.52, true, {
      "torso.y": [[0, -69], [0.13, -76], [0.26, -70], [0.39, -76], [0.52, -69]],
      "torso.rotation": [[0, -0.1], [0.26, 0.04], [0.52, -0.1]],
      "torso.scaleX": [[0, 1.04], [0.26, 0.96], [0.52, 1.04]],
      "head.rotation": [[0, 0.28], [0.26, 0.13], [0.52, 0.28]],
      "tailBase.rotation": [[0, -2.96], [0.26, -2.7], [0.52, -2.96]],
      "foreUpperFront.rotation": fastGait(0.78, 1.76),
      "foreLowerFront.rotation": fastGait(-0.48, 0.28),
      "foreUpperBack.rotation": fastGait(0.9, 1.64),
      "foreLowerBack.rotation": fastGait(-0.42, 0.22),
      "hindUpperFront.rotation": fastGait(1.82, 0.8),
      "hindLowerFront.rotation": fastGait(0.24, -0.58),
      "hindUpperBack.rotation": fastGait(1.7, 0.9),
      "hindLowerBack.rotation": fastGait(0.18, -0.5)
    }, [
      { id: "run-contact-front", time: 0.08, type: "footstep", category: "audio", payload: { pair: "front" } },
      { id: "run-contact-hind", time: 0.34, type: "footstep", category: "audio", payload: { pair: "hind" } }
    ]),
    jump: clip("jump", "Jump", 0.48, false, {
      "torso.y": [[0, -72], [0.09, -66], [0.25, -91], [0.48, -101]],
      "torso.rotation": [[0, 0.02], [0.09, 0.12], [0.25, -0.12], [0.48, -0.06]],
      "torso.scaleX": [[0, 1], [0.09, 1.1], [0.25, 0.95], [0.48, 0.98]],
      "torso.scaleY": [[0, 1], [0.09, 0.86], [0.25, 1.1], [0.48, 1.04]],
      "foreUpperFront.rotation": [[0, 1.27], [0.09, 1.58], [0.25, 0.64], [0.48, 0.82]],
      "foreUpperBack.rotation": [[0, 1.34], [0.09, 1.62], [0.25, 0.72], [0.48, 0.9]],
      "hindUpperFront.rotation": [[0, 1.31], [0.09, 0.92], [0.25, 1.72], [0.48, 1.58]],
      "hindUpperBack.rotation": [[0, 1.22], [0.09, 0.86], [0.25, 1.64], [0.48, 1.5]],
      "tailBase.rotation": [[0, -2.72], [0.25, -2.96], [0.48, -2.82]]
    }, [
      { id: "jump-anticipation", time: 0.06, type: "anticipation", category: "gameplay" },
      { id: "jump-liftoff", time: 0.11, type: "liftoff", category: "gameplay" }
    ]),
    fall: clip("fall", "Fall", 0.65, true, {
      "torso.y": [[0, -96], [0.325, -91], [0.65, -96]],
      "torso.rotation": [[0, -0.04], [0.325, 0.08], [0.65, -0.04]],
      "head.rotation": [[0, 0.12], [0.325, 0.04], [0.65, 0.12]],
      "ear.rotation": [[0, -0.28], [0.325, -0.42], [0.65, -0.28]],
      "foreUpperFront.rotation": [[0, 0.76], [0.325, 0.64], [0.65, 0.76]],
      "foreUpperBack.rotation": [[0, 0.84], [0.325, 0.7], [0.65, 0.84]],
      "hindUpperFront.rotation": [[0, 1.7], [0.325, 1.82], [0.65, 1.7]],
      "hindUpperBack.rotation": [[0, 1.62], [0.325, 1.76], [0.65, 1.62]],
      "tailBase.rotation": [[0, -2.9], [0.325, -3.04], [0.65, -2.9]]
    }),
    land: clip("land", "Land", 0.38, false, {
      "torso.y": [[0, -65], [0.13, -70], [0.38, -72]],
      "torso.rotation": [[0, 0.08], [0.13, -0.03], [0.38, 0]],
      "torso.scaleX": [[0, 1.14], [0.13, 0.97], [0.38, 1]],
      "torso.scaleY": [[0, 0.82], [0.13, 1.06], [0.38, 1]],
      "foreUpperFront.rotation": [[0, 1.68], [0.13, 1.38], [0.38, 1.27]],
      "foreUpperBack.rotation": [[0, 1.72], [0.13, 1.43], [0.38, 1.34]],
      "hindUpperFront.rotation": [[0, 0.94], [0.13, 1.2], [0.38, 1.31]],
      "hindUpperBack.rotation": [[0, 0.88], [0.13, 1.12], [0.38, 1.22]],
      "head.rotation": [[0, 0.31], [0.13, 0.16], [0.38, 0.22]],
      "tailBase.rotation": [[0, -2.48], [0.13, -2.84], [0.38, -2.72]]
    }, [
      { id: "land-impact", time: 0, type: "land", category: "gameplay", payload: { strength: 1 } },
      { id: "land-dust", time: 0.02, type: "dust", category: "vfx" }
    ])
  };
}

function clip(
  id: string,
  name: string,
  duration: number,
  loop: boolean,
  samplesByTrack: Readonly<Record<string, readonly (readonly [number, number])[]>>,
  events: AnimationClip["events"] = []
): AnimationClip {
  return {
    id,
    name,
    duration,
    frameRate: 60,
    loop,
    tracks: Object.fromEntries(Object.entries(samplesByTrack).map(([trackId, samples]) => [trackId, numericTrack(id, trackId, samples)])),
    events,
    markers: [{ id: `${id}-end`, time: duration, label: loop ? "Loop" : "End", color: loop ? "#4f8cff" : "#22c55e" }],
    tags: [id]
  };
}

function numericTrack(clipId: string, trackId: string, samples: readonly (readonly [number, number])[]): readonly Keyframe[] {
  const keyPrefix = `${clipId}-${trackId.replaceAll(".", "-")}`;
  return samples.map(([time, value], index) => ({
    id: `${keyPrefix}-${index}`,
    time,
    value,
    interpolation: "bezier",
    curve: [0.33, 0, 0.67, 1]
  }));
}

function gait(reach: number, neutral: number, push: number): readonly (readonly [number, number])[] {
  return [[0, reach], [0.2, neutral], [0.4, push], [0.6, neutral], [0.8, reach]];
}

function fastGait(first: number, opposite: number): readonly (readonly [number, number])[] {
  return [[0, first], [0.13, (first + opposite) / 2], [0.26, opposite], [0.39, (first + opposite) / 2], [0.52, first]];
}

function transition(
  id: string,
  fromStateId: string,
  toStateId: string,
  parameter: string,
  op: "==" | ">" | "<=",
  value: number | boolean,
  duration: number,
  priority = 0
): EditorProjectState["stateMachine"]["transitions"][number] {
  return {
    id,
    fromStateId,
    toStateId,
    duration,
    easing: priority > 0 ? "easeOut" : "easeInOut",
    priority,
    canInterrupt: true,
    syncMode: isLocomotionState(fromStateId) && isLocomotionState(toStateId) ? "phaseMatch" : "none",
    conditions: [{ parameter, op, value }]
  };
}

function isLocomotionState(stateId: string): boolean {
  return stateId === "idle" || stateId === "walk" || stateId === "run";
}

function transform(x: number, y: number, rotation = 0) {
  return { x, y, rotation, scaleX: 1, scaleY: 1 };
}

function pathPart(id: string, boneId: string, zIndex: number, pathCommands: readonly PathCommand[]): ShapePart {
  return {
    id,
    boneId,
    type: "path",
    pivot: [0, 0],
    points: pathCommands.flatMap((command) => ("x" in command ? [[command.x, command.y] as const] : [])),
    pathCommands,
    preset: undefined,
    zIndex
  };
}

function proceduralPart(id: string, boneId: string, preset: NonNullable<ShapePart["preset"]>, zIndex: number): ShapePart {
  return { id, boneId, type: "procedural", pivot: [0, 0], points: [], preset, zIndex };
}

function pawPath(): readonly PathCommand[] {
  return [
    { type: "M", x: -3, y: -6 },
    { type: "C", c1x: 6, c1y: -9, c2x: 22, c2y: -7, x: 27, y: -2 },
    { type: "C", c1x: 30, c1y: 3, c2x: 22, c2y: 7, x: 4, y: 7 },
    { type: "C", c1x: -2, c1y: 5, c2x: -5, c2y: 0, x: -3, y: -6 },
    { type: "Z" }
  ];
}

function characterName(name: string, fallback: string): string {
  return name.trim() || fallback;
}
