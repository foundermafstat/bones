import type { PathCommand } from "@bones/schema";

export interface BoneTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface EditorProjectState {
  readonly name: string;
  readonly selectedBoneId: string;
  readonly hierarchy: readonly string[];
  readonly parents: Readonly<Record<string, string | null>>;
  readonly bones: Readonly<Record<string, BoneTransform>>;
  readonly parts: Readonly<Record<string, ShapePart>>;
  readonly poses: Readonly<Record<string, PoseDefinition>>;
  readonly animations: Readonly<Record<string, AnimationClip>>;
  readonly stateMachine: EditorStateMachine;
  readonly procedural: ProceduralPresetState;
  readonly dirty: boolean;
  readonly dirtyParts: readonly string[];
}

export interface ShapePart {
  readonly id: string;
  readonly boneId: string;
  readonly type: "procedural" | "path" | "svg";
  readonly pivot: readonly [number, number];
  readonly points: readonly (readonly [number, number])[];
  readonly pathCommands?: readonly PathCommand[];
  readonly preset: "tapered-limb" | "organic-blob" | "capsule" | undefined;
  readonly assetPath?: string;
  readonly svgViewBox?: readonly [number, number, number, number];
  readonly width?: number;
  readonly anchor?: readonly [number, number];
  readonly offset?: readonly [number, number];
  readonly zIndex?: number;
}

export interface PoseDefinition {
  readonly id: string;
  readonly name: string;
  readonly boneTransforms: Readonly<Record<string, BoneTransform>>;
  readonly tags: readonly string[];
}

export interface AnimationClip {
  readonly id: string;
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: Readonly<Record<string, readonly Keyframe[]>>;
}

export interface Keyframe {
  readonly id: string;
  readonly time: number;
  readonly value: number;
  readonly interpolation: "linear" | "step" | "hold" | "bezier" | "spring";
  readonly curve?: readonly [number, number, number, number];
}

export interface EditorStateMachine {
  readonly initialStateId: string;
  readonly states: readonly { readonly id: string; readonly clipId: string }[];
  readonly transitions: readonly EditorTransition[];
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
}

export interface EditorTransition {
  readonly id: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly duration: number;
  readonly priority: number;
  readonly canInterrupt: boolean;
  readonly syncMode: "none" | "normalizedTime" | "phaseMatch";
}

export interface ProceduralPresetState {
  readonly breathing: { readonly enabled: boolean; readonly frequency: number; readonly amplitude: number; readonly affectedBones: readonly string[] };
  readonly secondaryMotion: { readonly enabled: boolean; readonly target: string; readonly stiffness: number; readonly damping: number; readonly velocityInfluence: number };
  readonly squashStretch: { readonly enabled: boolean; readonly targetBone: string; readonly landingImpactScale: number };
  readonly footIk: { readonly enabled: boolean; readonly feet: readonly string[]; readonly maxCorrection: number; readonly blend: number };
}

export interface EditorCommand {
  readonly id: string;
  readonly label: string;
  do(state: EditorProjectState): EditorProjectState;
  undo(state: EditorProjectState): EditorProjectState;
}

export interface CommandHistory {
  readonly past: readonly EditorCommand[];
  readonly future: readonly EditorCommand[];
}

export interface EditorStateContainer {
  readonly project: EditorProjectState;
  readonly history: CommandHistory;
}

export const initialEditorProject: EditorProjectState = {
  name: "Shadow Hero",
  selectedBoneId: "body",
  hierarchy: ["root", "cloak", "body", "head", "upperArmBack", "forearmBack", "handBack", "upperArmFront", "forearmFront", "handFront", "pelvis", "thighBack", "shinBack", "footBack", "thighFront", "shinFront", "footFront"],
  parents: {
    root: null,
    cloak: "body",
    body: "root",
    head: "body",
    upperArmBack: "body",
    forearmBack: "upperArmBack",
    handBack: "forearmBack",
    upperArmFront: "body",
    forearmFront: "upperArmFront",
    handFront: "forearmFront",
    pelvis: "body",
    thighBack: "pelvis",
    shinBack: "thighBack",
    footBack: "shinBack",
    thighFront: "pelvis",
    shinFront: "thighFront",
    footFront: "shinFront"
  },
  dirty: false,
  dirtyParts: [],
  bones: {
    root: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    cloak: { x: -74, y: 4, rotation: 0.04, scaleX: 1, scaleY: 1 },
    body: { x: 0, y: -250, rotation: 0, scaleX: 1, scaleY: 1 },
    head: { x: 0, y: -94, rotation: 0, scaleX: 1, scaleY: 1 },
    upperArmBack: { x: -44, y: -34, rotation: 0.08, scaleX: 1, scaleY: 1 },
    forearmBack: { x: -5, y: 70, rotation: -0.08, scaleX: 1, scaleY: 1 },
    handBack: { x: 0, y: 68, rotation: 0, scaleX: 1, scaleY: 1 },
    upperArmFront: { x: 48, y: -34, rotation: -0.05, scaleX: 1, scaleY: 1 },
    forearmFront: { x: 5, y: 70, rotation: 0.08, scaleX: 1, scaleY: 1 },
    handFront: { x: 0, y: 68, rotation: 0, scaleX: 1, scaleY: 1 },
    pelvis: { x: 0, y: 88, rotation: 0, scaleX: 1, scaleY: 1 },
    thighBack: { x: -27, y: 20, rotation: 0.04, scaleX: 1, scaleY: 1 },
    shinBack: { x: 0, y: 82, rotation: -0.02, scaleX: 1, scaleY: 1 },
    footBack: { x: -4, y: 78, rotation: -0.18, scaleX: 1, scaleY: 1 },
    thighFront: { x: 28, y: 20, rotation: -0.04, scaleX: 1, scaleY: 1 },
    shinFront: { x: 0, y: 82, rotation: 0.02, scaleX: 1, scaleY: 1 },
    footFront: { x: 5, y: 78, rotation: 0.12, scaleX: 1, scaleY: 1 }
  },
  parts: {
    cloakShape: { id: "cloakShape", boneId: "cloak", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_05_large_cape.svg", width: 238, anchor: [0.62, 0.1], zIndex: 1 },
    headShape: { id: "headShape", boneId: "head", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_01_rear_head_hair.svg", width: 118, anchor: [0.5, 0.72], zIndex: 8 },
    bodyShape: { id: "bodyShape", boneId: "body", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_08_back_torso.svg", width: 94, anchor: [0.5, 0.36], zIndex: 5 },
    pelvisShape: { id: "pelvisShape", boneId: "pelvis", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_13_pelvis_shorts.svg", width: 88, anchor: [0.5, 0.18], zIndex: 6 },
    upperArmBackShape: { id: "upperArmBackShape", boneId: "upperArmBack", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_06_left_upper_arm.svg", width: 43, anchor: [0.5, 0.08], zIndex: 3 },
    forearmBackShape: { id: "forearmBackShape", boneId: "forearmBack", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_10_left_forearm.svg", width: 42, anchor: [0.48, 0.08], zIndex: 3 },
    handBackShape: { id: "handBackShape", boneId: "handBack", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_14_left_hand.svg", width: 44, anchor: [0.52, 0.12], zIndex: 3 },
    upperArmFrontShape: { id: "upperArmFrontShape", boneId: "upperArmFront", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_07_right_upper_arm.svg", width: 42, anchor: [0.5, 0.08], zIndex: 7 },
    forearmFrontShape: { id: "forearmFrontShape", boneId: "forearmFront", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_11_right_forearm.svg", width: 42, anchor: [0.5, 0.08], zIndex: 7 },
    handFrontShape: { id: "handFrontShape", boneId: "handFront", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_15_right_hand.svg", width: 46, anchor: [0.48, 0.12], zIndex: 7 },
    thighBackShape: { id: "thighBackShape", boneId: "thighBack", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_17_left_thigh.svg", width: 54, anchor: [0.5, 0.05], zIndex: 3 },
    shinBackShape: { id: "shinBackShape", boneId: "shinBack", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_24_left_lower_leg.svg", width: 44, anchor: [0.5, 0.06], zIndex: 3 },
    footBackShape: { id: "footBackShape", boneId: "footBack", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_26_left_boot.svg", width: 70, anchor: [0.52, 0.16], zIndex: 3 },
    thighFrontShape: { id: "thighFrontShape", boneId: "thighFront", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_18_right_thigh.svg", width: 52, anchor: [0.5, 0.05], zIndex: 4 },
    shinFrontShape: { id: "shinFrontShape", boneId: "shinFront", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_25_right_lower_leg.svg", width: 44, anchor: [0.5, 0.06], zIndex: 4 },
    footFrontShape: { id: "footFrontShape", boneId: "footFront", type: "svg", pivot: [0, 0], points: [], preset: undefined, assetPath: "/assets/shadow-hero-silhouette/part_27_right_boot.svg", width: 70, anchor: [0.48, 0.16], zIndex: 4 }
  },
  poses: {
    idle_neutral: { id: "idle_neutral", name: "Idle neutral", boneTransforms: {}, tags: ["idle"] },
    breath_in: { id: "breath_in", name: "Breath in", boneTransforms: { body: { x: 0, y: -250, rotation: 0, scaleX: 1, scaleY: 1.025 } }, tags: ["idle"] },
    walk_contact: { id: "walk_contact", name: "Walk contact", boneTransforms: { thighFront: { x: 28, y: 20, rotation: -0.28, scaleX: 1, scaleY: 1 } }, tags: ["walk"] },
    jump_peak: { id: "jump_peak", name: "Jump peak", boneTransforms: { body: { x: 0, y: -286, rotation: -0.04, scaleX: 1, scaleY: 1.08 } }, tags: ["jump"] },
    land_heavy: { id: "land_heavy", name: "Land heavy", boneTransforms: { body: { x: 0, y: -250, rotation: 0, scaleX: 1.08, scaleY: 0.9 } }, tags: ["land"] }
  },
  animations: {
    idle: {
      id: "idle",
      duration: 1.2,
      loop: true,
      tracks: {
        "body.scaleY": [{ id: "idle-body-0", time: 0, value: 1, interpolation: "bezier" }, { id: "idle-body-1", time: 0.6, value: 1.025, interpolation: "bezier" }, { id: "idle-body-2", time: 1.2, value: 1, interpolation: "bezier" }],
        "head.rotation": [{ id: "idle-head-0", time: 0, value: -0.025, interpolation: "linear" }, { id: "idle-head-1", time: 0.6, value: 0.025, interpolation: "linear" }, { id: "idle-head-2", time: 1.2, value: -0.025, interpolation: "linear" }],
        "cloak.rotation": [{ id: "idle-cloak-0", time: 0, value: -0.05, interpolation: "linear" }, { id: "idle-cloak-1", time: 0.6, value: 0.055, interpolation: "linear" }, { id: "idle-cloak-2", time: 1.2, value: -0.05, interpolation: "linear" }]
      }
    },
    walk: {
      id: "walk",
      duration: 0.72,
      loop: true,
      tracks: {
        "body.y": [{ id: "walk-body-0", time: 0, value: -250, interpolation: "linear" }, { id: "walk-body-1", time: 0.36, value: -244, interpolation: "linear" }, { id: "walk-body-2", time: 0.72, value: -250, interpolation: "linear" }],
        "upperArmFront.rotation": [{ id: "walk-arm-f-0", time: 0, value: -0.24, interpolation: "linear" }, { id: "walk-arm-f-1", time: 0.36, value: 0.22, interpolation: "linear" }, { id: "walk-arm-f-2", time: 0.72, value: -0.24, interpolation: "linear" }],
        "upperArmBack.rotation": [{ id: "walk-arm-b-0", time: 0, value: 0.25, interpolation: "linear" }, { id: "walk-arm-b-1", time: 0.36, value: -0.22, interpolation: "linear" }, { id: "walk-arm-b-2", time: 0.72, value: 0.25, interpolation: "linear" }],
        "thighFront.rotation": [{ id: "walk-thigh-f-0", time: 0, value: -0.28, interpolation: "linear" }, { id: "walk-thigh-f-1", time: 0.36, value: 0.22, interpolation: "linear" }, { id: "walk-thigh-f-2", time: 0.72, value: -0.28, interpolation: "linear" }],
        "thighBack.rotation": [{ id: "walk-thigh-b-0", time: 0, value: 0.22, interpolation: "linear" }, { id: "walk-thigh-b-1", time: 0.36, value: -0.28, interpolation: "linear" }, { id: "walk-thigh-b-2", time: 0.72, value: 0.22, interpolation: "linear" }],
        "cloak.rotation": [{ id: "walk-cloak-0", time: 0, value: 0.1, interpolation: "linear" }, { id: "walk-cloak-1", time: 0.36, value: -0.06, interpolation: "linear" }, { id: "walk-cloak-2", time: 0.72, value: 0.1, interpolation: "linear" }]
      }
    },
    jump: { id: "jump", duration: 0.46, loop: false, tracks: { "body.y": [{ id: "jump-body-0", time: 0, value: -244, interpolation: "linear" }, { id: "jump-body-1", time: 0.46, value: -286, interpolation: "linear" }], "body.scaleY": [{ id: "jump-scale-0", time: 0, value: 0.9, interpolation: "linear" }, { id: "jump-scale-1", time: 0.46, value: 1.08, interpolation: "linear" }] } },
    fall: { id: "fall", duration: 0.6, loop: true, tracks: { "body.y": [{ id: "fall-body-0", time: 0, value: -280, interpolation: "linear" }, { id: "fall-body-1", time: 0.6, value: -252, interpolation: "linear" }], "cloak.rotation": [{ id: "fall-cloak-0", time: 0, value: -0.18, interpolation: "linear" }, { id: "fall-cloak-1", time: 0.6, value: -0.04, interpolation: "linear" }] } },
    land: { id: "land", duration: 0.34, loop: false, tracks: { "body.scaleX": [{ id: "land-x-0", time: 0, value: 1.14, interpolation: "linear" }, { id: "land-x-1", time: 0.34, value: 1, interpolation: "linear" }], "body.scaleY": [{ id: "land-y-0", time: 0, value: 0.82, interpolation: "linear" }, { id: "land-y-1", time: 0.34, value: 1, interpolation: "linear" }] } }
  },
  stateMachine: {
    initialStateId: "idle",
    states: [
      { id: "idle", clipId: "idle" },
      { id: "walk", clipId: "walk" },
      { id: "jump", clipId: "jump" },
      { id: "fall", clipId: "fall" },
      { id: "land", clipId: "land" }
    ],
    transitions: [{ id: "idle-walk", fromStateId: "idle", toStateId: "walk", duration: 0.18, priority: 0, canInterrupt: true, syncMode: "phaseMatch" }],
    parameters: { absSpeed: 0, velocityY: 0, grounded: true, jumpPressed: false, facing: 1, wallContact: "none", timeInState: 0 }
  },
  procedural: {
    breathing: { enabled: true, frequency: 0.8, amplitude: 1, affectedBones: ["body", "head"] },
    secondaryMotion: { enabled: true, target: "cloak", stiffness: 0.22, damping: 0.72, velocityInfluence: 0.35 },
    squashStretch: { enabled: true, targetBone: "body", landingImpactScale: 0.18 },
    footIk: { enabled: false, feet: ["footFront"], maxCorrection: 8, blend: 0.75 }
  }
};

export function executeCommand(container: EditorStateContainer, command: EditorCommand): EditorStateContainer {
  return {
    project: command.do(container.project),
    history: { past: [...container.history.past, command], future: [] }
  };
}

export function undo(container: EditorStateContainer): EditorStateContainer {
  const command = container.history.past[container.history.past.length - 1];
  if (!command) {
    return container;
  }
  return {
    project: command.undo(container.project),
    history: {
      past: container.history.past.slice(0, -1),
      future: [command, ...container.history.future]
    }
  };
}

export function redo(container: EditorStateContainer): EditorStateContainer {
  const command = container.history.future[0];
  if (!command) {
    return container;
  }
  return {
    project: command.do(container.project),
    history: {
      past: [...container.history.past, command],
      future: container.history.future.slice(1)
    }
  };
}

export function createMoveBoneCommand(boneId: string, dx: number, dy: number): EditorCommand {
  return {
    id: `move:${boneId}:${dx}:${dy}`,
    label: "Move bone",
    do: (state) => updateBone(state, boneId, (bone) => ({ ...bone, x: bone.x + dx, y: bone.y + dy })),
    undo: (state) => updateBone(state, boneId, (bone) => ({ ...bone, x: bone.x - dx, y: bone.y - dy }))
  };
}

export function createRotateBoneCommand(boneId: string, delta: number): EditorCommand {
  return {
    id: `rotate:${boneId}:${delta}`,
    label: "Rotate bone",
    do: (state) => updateBone(state, boneId, (bone) => ({ ...bone, rotation: bone.rotation + delta })),
    undo: (state) => updateBone(state, boneId, (bone) => ({ ...bone, rotation: bone.rotation - delta }))
  };
}

export function createAddBoneCommand(parentId: string, boneId: string): EditorCommand {
  const transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  return {
    id: `add-bone:${parentId}:${boneId}`,
    label: "Add bone",
    do: (state) => ({
      ...markDirty(state, boneId),
      selectedBoneId: boneId,
      hierarchy: state.hierarchy.includes(boneId) ? state.hierarchy : [...state.hierarchy, boneId],
      parents: { ...state.parents, [boneId]: parentId },
      bones: { ...state.bones, [boneId]: transform }
    }),
    undo: (state) => removeBone(state, boneId, parentId)
  };
}

export function createDeleteBoneCommand(boneId: string): EditorCommand {
  return {
    id: `delete-bone:${boneId}`,
    label: "Delete bone",
    do: (state) => removeBone(state, boneId, state.parents[boneId] ?? "root"),
    undo: (state) => ({
      ...markDirty(state, boneId),
      hierarchy: state.hierarchy.includes(boneId) ? state.hierarchy : [...state.hierarchy, boneId],
      parents: { ...state.parents, [boneId]: state.parents[boneId] ?? "root" },
      bones: { ...state.bones, [boneId]: state.bones[boneId] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }
    })
  };
}

export function createRenameBoneCommand(boneId: string, nextId: string): EditorCommand {
  return {
    id: `rename-bone:${boneId}:${nextId}`,
    label: "Rename bone",
    do: (state) => renameBone(state, boneId, nextId),
    undo: (state) => renameBone(state, nextId, boneId)
  };
}

export function createSetParentCommand(boneId: string, parentId: string | null): EditorCommand {
  return {
    id: `set-parent:${boneId}:${parentId ?? "root"}`,
    label: "Set parent",
    do: (state) => ({ ...markDirty(state, boneId), parents: { ...state.parents, [boneId]: parentId } }),
    undo: (state) => ({ ...markDirty(state, boneId), parents: { ...state.parents, [boneId]: state.parents[boneId] ?? null } })
  };
}

export function createBindProceduralPartCommand(partId: string, boneId: string, preset: ShapePart["preset"]): EditorCommand {
  return {
    id: `bind-part:${partId}:${boneId}`,
    label: "Bind procedural part",
    do: (state) => ({
      ...markDirty(state, partId),
      parts: { ...state.parts, [partId]: { id: partId, boneId, type: "procedural", pivot: [0, 0], points: [], preset } }
    }),
    undo: (state) => {
      const { [partId]: _removed, ...parts } = state.parts;
      return { ...markDirty(state, partId), parts };
    }
  };
}

export function createEditPathPointCommand(partId: string, index: number, point?: readonly [number, number]): EditorCommand {
  const update = (state: EditorProjectState, nextPoint: readonly [number, number] | undefined) => {
    const part = state.parts[partId];
    if (!part) {
      return state;
    }
    const points = [...part.points];
    if (nextPoint) {
      points[index] = nextPoint;
    } else {
      points.splice(index, 1);
    }
    const nextPart: ShapePart = withPointPath(part, points);
    return { ...markDirty(state, partId), parts: { ...state.parts, [partId]: nextPart } };
  };
  return {
    id: `edit-point:${partId}:${index}`,
    label: "Edit path point",
    do: (state) => update(state, point),
    undo: (state) => update(state, state.parts[partId]?.points[index])
  };
}

export function createMirrorPathCommand(partId: string): EditorCommand {
  const mirror = (state: EditorProjectState) => {
    const part = state.parts[partId];
    return part
      ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: withPointPath(part, part.points.map(([x, y]) => [-x, y] as const)) } }
      : state;
  };
  return { id: `mirror-path:${partId}`, label: "Mirror path", do: mirror, undo: mirror };
}

export function createSetPartPathCommand(
  partId: string,
  points: readonly (readonly [number, number])[],
  pathCommands?: readonly PathCommand[],
  svgViewBox?: readonly [number, number, number, number]
): EditorCommand {
  let previous: ShapePart | undefined;
  return {
    id: `set-part-path:${partId}`,
    label: "Set part path",
    do: (state) => {
      const part = state.parts[partId];
      previous = part;
      if (!part) {
        return state;
      }
      const { pathCommands: _pathCommands, svgViewBox: _svgViewBox, ...basePart } = part;
      return {
        ...markDirty(state, partId),
        parts: {
          ...state.parts,
          [partId]: {
            ...basePart,
            type: "path",
            points,
            ...(pathCommands ? { pathCommands } : {}),
            ...(svgViewBox ? { svgViewBox } : {})
          }
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: previous } } : state)
  };
}

function withPointPath(part: ShapePart, points: readonly (readonly [number, number])[]): ShapePart {
  const { pathCommands: _pathCommands, ...pointPart } = part;
  return { ...pointPart, type: "path", points };
}

export function createSetPartPivotCommand(partId: string, pivot: readonly [number, number]): EditorCommand {
  let previous: readonly [number, number] = [0, 0];
  return {
    id: `set-pivot:${partId}:${pivot.join(",")}`,
    label: "Set pivot",
    do: (state) => {
      const part = state.parts[partId];
      previous = part?.pivot ?? previous;
      return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, pivot } } } : state;
    },
    undo: (state) => {
      const part = state.parts[partId];
      return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, pivot: previous } } } : state;
    }
  };
}

export function createSetPartDrawOrderCommand(partId: string, zIndex: number): EditorCommand {
  let previous = 0;
  return {
    id: `set-draw-order:${partId}:${zIndex}`,
    label: "Set draw order",
    do: (state) => {
      const part = state.parts[partId];
      previous = part?.zIndex ?? previous;
      return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, zIndex } } } : state;
    },
    undo: (state) => {
      const part = state.parts[partId];
      return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, zIndex: previous } } } : state;
    }
  };
}

export function createApplyPoseCommand(poseId: string): EditorCommand {
  let previous: Readonly<Record<string, BoneTransform>> = {};
  return {
    id: `apply-pose:${poseId}`,
    label: "Apply pose",
    do: (state) => {
      const pose = state.poses[poseId];
      if (!pose) {
        return state;
      }
      previous = Object.fromEntries(
        Object.keys(pose.boneTransforms)
          .map((boneId): [string, BoneTransform | undefined] => [boneId, state.bones[boneId]])
          .filter((entry): entry is [string, BoneTransform] => Boolean(entry[1]))
      );
      return {
        ...markDirty(state, poseId),
        bones: { ...state.bones, ...pose.boneTransforms }
      };
    },
    undo: (state) => ({ ...markDirty(state, poseId), bones: { ...state.bones, ...previous } })
  };
}

export function createDuplicatePoseCommand(poseId: string, nextId: string): EditorCommand {
  return {
    id: `duplicate-pose:${poseId}:${nextId}`,
    label: "Duplicate pose",
    do: (state) => {
      const pose = state.poses[poseId];
      return pose ? { ...markDirty(state, nextId), poses: { ...state.poses, [nextId]: { ...pose, id: nextId, name: `${pose.name} Copy` } } } : state;
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId), poses };
    }
  };
}

export function createMirrorPoseCommand(poseId: string, nextId: string): EditorCommand {
  return {
    id: `mirror-pose:${poseId}:${nextId}`,
    label: "Mirror pose",
    do: (state) => {
      const pose = state.poses[poseId];
      if (!pose) {
        return state;
      }
      const boneTransforms = Object.fromEntries(Object.entries(pose.boneTransforms).map(([boneId, transform]) => [boneId, { ...transform, x: -transform.x, rotation: -transform.rotation }]));
      return { ...markDirty(state, nextId), poses: { ...state.poses, [nextId]: { ...pose, id: nextId, name: `${pose.name} Mirrored`, boneTransforms } } };
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId), poses };
    }
  };
}

export function createAddKeyframeCommand(clipId: string, trackId: string, keyframe: Keyframe): EditorCommand {
  return {
    id: `add-key:${clipId}:${trackId}:${keyframe.id}`,
    label: "Add keyframe",
    do: (state) => updateClipTrack(state, clipId, trackId, (keys) => [...keys, keyframe].sort((a, b) => a.time - b.time)),
    undo: (state) => updateClipTrack(state, clipId, trackId, (keys) => keys.filter((key) => key.id !== keyframe.id))
  };
}

export function createDeleteKeyframeCommand(clipId: string, trackId: string, keyframeId: string): EditorCommand {
  let removed: Keyframe | undefined;
  return {
    id: `delete-key:${clipId}:${trackId}:${keyframeId}`,
    label: "Delete keyframe",
    do: (state) =>
      updateClipTrack(state, clipId, trackId, (keys) => {
        removed = keys.find((key) => key.id === keyframeId);
        return keys.filter((key) => key.id !== keyframeId);
      }),
    undo: (state) => (removed ? updateClipTrack(state, clipId, trackId, (keys) => [...keys, removed!].sort((a, b) => a.time - b.time)) : state)
  };
}

export function createMoveKeyframeCommand(clipId: string, trackId: string, keyframeId: string, nextTime: number): EditorCommand {
  let previousTime = 0;
  const move = (state: EditorProjectState, time: number) =>
    updateClipTrack(state, clipId, trackId, (keys) =>
      keys
        .map((key) => {
          if (key.id !== keyframeId) {
            return key;
          }
          previousTime = key.time;
          return { ...key, time };
        })
        .sort((a, b) => a.time - b.time)
    );
  return {
    id: `move-key:${clipId}:${trackId}:${keyframeId}`,
    label: "Move keyframe",
    do: (state) => move(state, nextTime),
    undo: (state) => move(state, previousTime)
  };
}

export function createChangeCurveCommand(
  clipId: string,
  trackId: string,
  keyframeId: string,
  interpolation: Keyframe["interpolation"],
  curve: readonly [number, number, number, number]
): EditorCommand {
  let previous: Keyframe | undefined;
  const change = (state: EditorProjectState, next: { interpolation: Keyframe["interpolation"]; curve: readonly [number, number, number, number] }) =>
    updateClipTrack(state, clipId, trackId, (keys) =>
      keys.map((key) => {
        if (key.id !== keyframeId) {
          return key;
        }
        previous = key;
        return { ...key, interpolation: next.interpolation, curve: next.curve };
      })
    );
  return {
    id: `curve:${clipId}:${trackId}:${keyframeId}`,
    label: "Change curve",
    do: (state) => change(state, { interpolation, curve }),
    undo: (state) => (previous ? change(state, { interpolation: previous.interpolation, curve: previous.curve ?? [0, 0, 1, 1] }) : state)
  };
}

export function createTransitionCommand(transition: EditorTransition): EditorCommand {
  return {
    id: `transition:${transition.id}`,
    label: "Create transition",
    do: (state) => ({
      ...markDirty(state, transition.id),
      stateMachine: {
        ...state.stateMachine,
        transitions: state.stateMachine.transitions.some((item) => item.id === transition.id) ? state.stateMachine.transitions : [...state.stateMachine.transitions, transition]
      }
    }),
    undo: (state) => ({
      ...markDirty(state, transition.id),
      stateMachine: {
        ...state.stateMachine,
        transitions: state.stateMachine.transitions.filter((item) => item.id !== transition.id)
      }
    })
  };
}

export function createUpdateProceduralCommand(next: Partial<ProceduralPresetState>): EditorCommand {
  let previous: ProceduralPresetState | undefined;
  return {
    id: "procedural:update",
    label: "Update procedural preset",
    do: (state) => {
      previous = state.procedural;
      return {
        ...markDirty(state, "procedural"),
        procedural: {
          breathing: { ...state.procedural.breathing, ...next.breathing },
          secondaryMotion: { ...state.procedural.secondaryMotion, ...next.secondaryMotion },
          squashStretch: { ...state.procedural.squashStretch, ...next.squashStretch },
          footIk: { ...state.procedural.footIk, ...next.footIk }
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, "procedural"), procedural: previous } : state)
  };
}

function updateBone(state: EditorProjectState, boneId: string, updater: (bone: BoneTransform) => BoneTransform): EditorProjectState {
  const current = state.bones[boneId];
  if (!current) {
    return state;
  }
  return {
    ...markDirty(state, boneId),
    bones: {
      ...state.bones,
      [boneId]: updater(current)
    }
  };
}

function markDirty(state: EditorProjectState, id: string): EditorProjectState {
  return {
    ...state,
    dirty: true,
    dirtyParts: state.dirtyParts.includes(id) ? state.dirtyParts : [...state.dirtyParts, id]
  };
}

function removeBone(state: EditorProjectState, boneId: string, fallbackSelection: string | null): EditorProjectState {
  const { [boneId]: _removedBone, ...bones } = state.bones;
  const { [boneId]: _removedParent, ...parents } = state.parents;
  return {
    ...markDirty(state, boneId),
    selectedBoneId: fallbackSelection ?? "root",
    hierarchy: state.hierarchy.filter((item) => item !== boneId),
    parents,
    bones
  };
}

function renameBone(state: EditorProjectState, boneId: string, nextId: string): EditorProjectState {
  const current = state.bones[boneId];
  if (!current || state.bones[nextId]) {
    return state;
  }
  const { [boneId]: _removedBone, ...bones } = state.bones;
  const { [boneId]: parent, ...parents } = state.parents;
  return {
    ...markDirty(state, nextId),
    selectedBoneId: state.selectedBoneId === boneId ? nextId : state.selectedBoneId,
    hierarchy: state.hierarchy.map((item) => (item === boneId ? nextId : item)),
    parents: Object.fromEntries(Object.entries({ ...parents, [nextId]: parent ?? null }).map(([child, value]) => [child, value === boneId ? nextId : value])),
    bones: { ...bones, [nextId]: current }
  };
}

function updateClipTrack(state: EditorProjectState, clipId: string, trackId: string, updater: (keys: readonly Keyframe[]) => readonly Keyframe[]): EditorProjectState {
  const clip = state.animations[clipId];
  if (!clip) {
    return state;
  }
  return {
    ...markDirty(state, clipId),
    animations: {
      ...state.animations,
      [clipId]: {
        ...clip,
        tracks: {
          ...clip.tracks,
          [trackId]: updater(clip.tracks[trackId] ?? [])
        }
      }
    }
  };
}
