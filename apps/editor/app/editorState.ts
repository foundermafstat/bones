import type { JsonValue, MeshShape, PathCommand } from "@bones/schema";
import {
  closePath as closeVectorPath,
  convertLineToSmoothCubic,
  openPath as openVectorPath,
  reversePath as reverseVectorPath,
  simplifyPath as simplifyVectorPath,
  smoothPath as smoothVectorPath,
  type PathCommand as VectorPathCommand
} from "@bones/vector-core";

export interface BoneTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export type CharacterKind = "human" | "dog" | "cat";

export interface EditorFacialSideMapping {
  readonly left: string;
  readonly right: string;
}

export interface EditorFacialGazeBounds {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
}

export interface EditorFacialPointMapping {
  readonly left: readonly [number, number];
  readonly right: readonly [number, number];
}

export interface EditorFacialRig {
  readonly expressionSlots: EditorFacialSideMapping;
  readonly pupilSlots: EditorFacialSideMapping;
  readonly eyeAimBones: EditorFacialSideMapping;
  readonly irisParallaxParts?: EditorFacialSideMapping;
  readonly irisOrigins?: EditorFacialPointMapping;
  readonly irisParallax?: number;
  readonly gazeBounds: EditorFacialGazeBounds;
  readonly gazeBoundsByExpression?: Readonly<Record<string, EditorFacialGazeBounds>>;
  readonly aperturesByExpression?: Readonly<Record<string, readonly number[]>>;
  readonly linkedByDefault: boolean;
}

export interface EditorProjectState {
  readonly projectId: string;
  readonly rigId: string;
  readonly stateMachineId: string;
  readonly name: string;
  readonly characterKind: CharacterKind;
  readonly selectedBoneId: string;
  readonly hierarchy: readonly string[];
  readonly parents: Readonly<Record<string, string | null>>;
  readonly bones: Readonly<Record<string, BoneTransform>>;
  readonly boneMetadata: Readonly<Record<string, BoneMetadata>>;
  readonly boneLengths: Readonly<Record<string, number>>;
  readonly topology: EditorRigTopology;
  readonly parts: Readonly<Record<string, ShapePart>>;
  readonly visualSlots: Readonly<Record<string, EditorVisualSlot>>;
  readonly skins: Readonly<Record<string, EditorSkin>>;
  readonly activeSkinId: string;
  readonly facialRig?: EditorFacialRig;
  readonly ikChains: Readonly<Record<string, EditorIkChain>>;
  readonly poses: Readonly<Record<string, PoseDefinition>>;
  readonly poseClipboard: PoseDefinition | null;
  readonly animations: Readonly<Record<string, AnimationClip>>;
  readonly timeline: TimelineState;
  readonly stateMachine: EditorStateMachine;
  readonly procedural: ProceduralPresetState;
  readonly dirtyScopes: DirtyScopes;
  readonly autosave: AutosaveState;
  readonly dirty: boolean;
  readonly dirtyParts: readonly string[];
}

export interface BoneMetadata {
  readonly locked?: boolean;
  readonly hidden?: boolean;
  readonly mirrorGroup?: string;
  readonly tags?: readonly string[];
  readonly facing?: -1 | 1;
}

export interface BoneMetadataPatch {
  readonly locked?: boolean | undefined;
  readonly hidden?: boolean | undefined;
  readonly mirrorGroup?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly facing?: -1 | 1 | undefined;
}

export interface EditorJoint {
  readonly id: string;
  readonly name: string;
  readonly boneId: string;
}

export interface EditorBoneSegment {
  readonly id: string;
  readonly name: string;
  readonly startJointId: string;
  readonly endJointId: string;
  readonly boneId: string;
  readonly groupId: string;
}

export interface EditorBoneGroup {
  readonly id: string;
  readonly name: string;
  readonly boneIds: readonly string[];
  readonly locked?: boolean;
  readonly hidden?: boolean;
}

export interface EditorRigTopology {
  readonly joints: Readonly<Record<string, EditorJoint>>;
  readonly segments: Readonly<Record<string, EditorBoneSegment>>;
  readonly groups: Readonly<Record<string, EditorBoneGroup>>;
  readonly activeGroupId: string;
}

export interface ShapePart {
  readonly id: string;
  readonly boneId: string;
  readonly type: "procedural" | "path" | "svg" | "mesh";
  readonly pivot: readonly [number, number];
  readonly points: readonly (readonly [number, number])[];
  readonly pathCommands?: readonly PathCommand[];
  readonly mesh?: MeshShape;
  readonly preset: "tapered-limb" | "organic-blob" | "capsule" | undefined;
  readonly assetPath?: string;
  readonly assetUrl?: string;
  readonly svgViewBox?: readonly [number, number, number, number];
  readonly intrinsicSize?: readonly [number, number];
  readonly aspectLocked?: boolean;
  readonly width?: number;
  readonly anchor?: readonly [number, number];
  readonly offset?: readonly [number, number];
  readonly rotation?: number;
  readonly scale?: readonly [number, number];
  readonly opacity?: number;
  readonly zIndex?: number;
}

export interface EditorVisualSlot {
  readonly id: string;
  readonly name: string;
  readonly boneId: string;
  readonly drawOrder: number;
  readonly partIds: readonly string[];
  readonly visible?: boolean;
  readonly locked?: boolean;
}

export interface EditorSkin {
  readonly id: string;
  readonly name: string;
  readonly attachments: Readonly<Record<string, string | null>>;
}

export interface EditorIkChain {
  readonly id: string;
  readonly name: string;
  readonly rootBoneId: string;
  readonly middleBoneId: string;
  readonly endBoneId: string;
  readonly bendDirection: -1 | 1;
  readonly poleAngle: number;
  readonly stretch: boolean;
}

export function createEditorAppearance(parts: Readonly<Record<string, ShapePart>>): {
  readonly visualSlots: Readonly<Record<string, EditorVisualSlot>>;
  readonly skins: Readonly<Record<string, EditorSkin>>;
  readonly activeSkinId: string;
} {
  const orderedParts = Object.values(parts).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return {
    visualSlots: Object.fromEntries(
      orderedParts.map((part, index) => [
        part.id,
        { id: part.id, name: humanizeEditorId(part.id.replace(/Shape$/, "")), boneId: dominantPartBone(part) ?? part.boneId, drawOrder: part.zIndex ?? index, partIds: [part.id] }
      ])
    ),
    skins: {
      default: { id: "default", name: "Default", attachments: Object.fromEntries(orderedParts.map((part) => [part.id, part.id])) }
    },
    activeSkinId: "default"
  };
}

function dominantPartBone(part: ShapePart): string | undefined {
  const weights = new Map<string, number>();
  for (const vertex of part.mesh?.skin ?? []) {
    for (const influence of vertex) weights.set(influence.boneId, (weights.get(influence.boneId) ?? 0) + influence.weight);
  }
  return [...weights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

export function createDefaultEditorIkChains(bones: Readonly<Record<string, BoneTransform>>): Readonly<Record<string, EditorIkChain>> {
  const candidates: readonly EditorIkChain[] = [
    { id: "frontArm", name: "Front arm", rootBoneId: "upperArmFront", middleBoneId: "forearmFront", endBoneId: "handFront", bendDirection: 1, poleAngle: -35, stretch: false },
    { id: "rearArm", name: "Rear arm", rootBoneId: "upperArmBack", middleBoneId: "forearmBack", endBoneId: "handBack", bendDirection: -1, poleAngle: 35, stretch: false },
    { id: "frontLeg", name: "Front leg", rootBoneId: "thighFront", middleBoneId: "shinFront", endBoneId: "footFront", bendDirection: 1, poleAngle: -20, stretch: false },
    { id: "rearLeg", name: "Rear leg", rootBoneId: "thighBack", middleBoneId: "shinBack", endBoneId: "footBack", bendDirection: -1, poleAngle: 20, stretch: false },
    { id: "darkFrontArm", name: "Front arm", rootBoneId: "bone13", middleBoneId: "bone18", endBoneId: "bone19", bendDirection: -1, poleAngle: 35, stretch: false },
    { id: "darkRearArm", name: "Rear arm", rootBoneId: "bone14", middleBoneId: "bone15", endBoneId: "bone16", bendDirection: 1, poleAngle: -35, stretch: false },
    { id: "darkRearLeg", name: "Rear leg", rootBoneId: "bone2", middleBoneId: "bone3", endBoneId: "bone4", bendDirection: -1, poleAngle: 18, stretch: false },
    { id: "darkFrontLeg", name: "Front leg", rootBoneId: "bone6", middleBoneId: "bone7", endBoneId: "bone8", bendDirection: 1, poleAngle: -18, stretch: false }
  ];
  return Object.fromEntries(candidates.filter((chain) => bones[chain.rootBoneId] && bones[chain.middleBoneId] && bones[chain.endBoneId]).map((chain) => [chain.id, chain]));
}

export function hasAnimatedDrawOrderTracks(project: Pick<EditorProjectState, "animations">): boolean {
  return Object.values(project.animations).some((clip) => Object.keys(clip.tracks).some((trackId) => trackId.endsWith(".drawOrder")));
}

function humanizeEditorId(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export interface PoseDefinition {
  readonly id: string;
  readonly name: string;
  readonly boneTransforms: Readonly<Record<string, BoneTransform>>;
  readonly deforms?: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly partProperties?: Readonly<Record<string, PosePartProperties>>;
  readonly tags: readonly string[];
}

export interface PosePartProperties {
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly drawOrder?: number;
}

export interface AnimationClip {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly frameRate: number;
  readonly loop: boolean;
  readonly tracks: Readonly<Record<string, readonly Keyframe[]>>;
  readonly events: readonly TimelineEvent[];
  readonly markers: readonly TimelineMarker[];
  readonly tags: readonly string[];
}

export interface Keyframe {
  readonly id: string;
  readonly time: number;
  readonly value: JsonValue;
  readonly interpolation: "linear" | "step" | "hold" | "bezier" | "spring";
  readonly curve?: readonly [number, number, number, number];
  readonly curvePreset?: CurvePreset;
  readonly tangentIn?: number;
  readonly tangentOut?: number;
}

export type CurvePreset = "linear" | "step" | "hold" | "bezier" | "easeIn" | "easeOut" | "easeInOut" | "cubicBezier" | "stepped" | "spring" | "overshoot" | "anticipation" | "custom";

export interface TimelineEvent {
  readonly id: string;
  readonly time: number;
  readonly type: string;
  readonly category?: "gameplay" | "audio" | "vfx" | "camera" | "debug";
  readonly duration?: number;
  readonly payload?: Readonly<Record<string, JsonValue>>;
}

export interface TimelineEventPatch {
  readonly time?: number;
  readonly type?: string;
  readonly category?: TimelineEvent["category"];
  readonly duration?: number | undefined;
  readonly payload?: TimelineEvent["payload"];
}

export interface TimelineMarker {
  readonly id: string;
  readonly time: number;
  readonly label: string;
  readonly color?: string;
}

export interface TimelineClipboardKey {
  readonly trackId: string;
  readonly keyframe: Keyframe;
}

export interface TimelineState {
  readonly selectedClipId: string;
  readonly selectedKeyIds: readonly string[];
  readonly keyClipboard: readonly TimelineClipboardKey[];
  readonly autoKey: boolean;
  readonly snappingFps: number;
  readonly virtualWindow: { readonly startRow: number; readonly rowCount: number };
  readonly curvePreview: { readonly fromClipId: string; readonly toClipId: string; readonly weight: number };
}

export interface EditorStateMachine {
  readonly initialStateId: string;
  readonly states: readonly EditorStateNode[];
  readonly transitions: readonly EditorTransition[];
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
  readonly nodePositions?: Readonly<Record<string, StateMachineNodePosition>>;
  readonly preview: { readonly fromStateId: string; readonly toStateId: string; readonly weight: number };
}

export interface StateMachineNodePosition {
  readonly x: number;
  readonly y: number;
}

export interface EditorStateNode {
  readonly id: string;
  readonly clipId: string;
  readonly blendTree?: BlendTree1D;
  readonly tags?: readonly string[];
}

export interface BlendTree1D {
  readonly type: "1d";
  readonly parameter: string;
  readonly children: readonly { readonly threshold: number; readonly clipId: string }[];
}

export interface EditorTransition {
  readonly id: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly duration: number;
  readonly easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "cubicBezier" | "spring" | "overshoot" | "anticipation";
  readonly priority: number;
  readonly canInterrupt: boolean;
  readonly syncMode: "none" | "normalizedTime" | "phaseMatch";
  readonly interruptWindow?: readonly [number, number];
  readonly conditions: readonly EditorTransitionCondition[];
}

export interface EditorTransitionCondition {
  readonly parameter: string;
  readonly op: "==" | "!=" | ">" | ">=" | "<" | "<=";
  readonly value: number | boolean | string;
}

export interface StateMachineSimulation {
  readonly activeStateId: string;
  readonly previousStateId: string;
  readonly transitionId?: string;
  readonly transitionWeight: number;
  readonly blendWeights: readonly { readonly clipId: string; readonly weight: number }[];
}

export interface ProceduralPresetState {
  readonly inputs: { readonly velocityX: number; readonly velocityY: number; readonly gravity: number; readonly wind: number; readonly grounded: boolean; readonly jumpStart: boolean; readonly landHeavy: boolean };
  readonly breathing: { readonly enabled: boolean; readonly frequency: number; readonly amplitude: number; readonly affectedBones: readonly string[]; readonly affectedBoneTransforms: Readonly<Record<string, Partial<BoneTransform>>> };
  readonly secondaryMotion: { readonly enabled: boolean; readonly target: string; readonly stiffness: number; readonly damping: number; readonly velocityInfluence: number; readonly gravityInfluence: number; readonly windInfluence: number; readonly maxOffset: number };
  readonly squashStretch: { readonly enabled: boolean; readonly targetBone: string; readonly landingImpactScale: number; readonly rules: readonly SquashStretchRule[] };
  readonly footIk: { readonly enabled: boolean; readonly feet: readonly string[]; readonly footChains: readonly FootIkChain[]; readonly maxCorrection: number; readonly blend: number };
}

export interface SquashStretchRule {
  readonly condition: string;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly duration: number;
}

export interface FootIkChain {
  readonly footBone: string;
  readonly shinBone?: string;
  readonly thighBone?: string;
  readonly raycastOffsetX: number;
  readonly raycastHeight: number;
}

export type DirtyScopeName = "project" | "bones" | "parts" | "animations" | "poses" | "stateMachine" | "procedural" | "preview";

export type DirtyScopes = Readonly<Record<DirtyScopeName, readonly string[]>>;

export interface AutosaveState {
  readonly status: "idle" | "pending" | "saved";
  readonly revision: number;
  readonly throttleMs: number;
  readonly lastChangedAt: number;
  readonly nextSaveAt: number;
  readonly lastSavedAt?: number;
}

export interface EditorCommand {
  readonly id: string;
  readonly label: string;
  do(state: EditorProjectState): EditorProjectState;
  undo(state: EditorProjectState): EditorProjectState;
}

export interface EditorCommandRecord {
  readonly command: EditorCommand;
  readonly uiBefore: EditorUiSnapshot;
  readonly uiAfter: EditorUiSnapshot;
}

export interface CommandHistory {
  readonly past: readonly EditorCommandRecord[];
  readonly future: readonly EditorCommandRecord[];
}

export interface EditorStateContainer {
  readonly project: EditorProjectState;
  readonly history: CommandHistory;
}

export interface EditorUiSnapshot {
  readonly selectedBoneId: string;
  readonly selectedClipId: string;
  readonly selectedKeyIds: readonly string[];
  readonly curvePreview: TimelineState["curvePreview"];
  readonly selectedTransitionId?: string;
  readonly stateMachinePreview: EditorStateMachine["preview"];
}

export interface ExecuteCommandOptions {
  readonly validate?: (project: EditorProjectState) => void;
}

export interface ProjectTransaction {
  readonly label: string;
  readonly base: EditorStateContainer;
  readonly current: EditorStateContainer;
  readonly commands: readonly EditorCommand[];
}

export const AUTOSAVE_THROTTLE_MS = 750;

export const cleanDirtyScopes: DirtyScopes = {
  project: [],
  bones: [],
  parts: [],
  animations: [],
  poses: [],
  stateMachine: [],
  procedural: [],
  preview: []
};

export const initialAutosaveState: AutosaveState = {
  status: "idle",
  revision: 0,
  throttleMs: AUTOSAVE_THROTTLE_MS,
  lastChangedAt: 0,
  nextSaveAt: 0
};

export function createProjectIdentity(): Pick<EditorProjectState, "projectId" | "rigId" | "stateMachineId"> {
  const id = globalThis.crypto?.randomUUID?.() ?? `bones-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return { projectId: id, rigId: `${id}-rig`, stateMachineId: `${id}-state-machine` };
}

export function createEditorTopology(
  hierarchy: readonly string[],
  parents: Readonly<Record<string, string | null>>,
  groups?: readonly EditorBoneGroup[]
): EditorRigTopology {
  const joints = Object.fromEntries(hierarchy.map((boneId) => [boneId, { id: boneId, name: humanizeEditorId(boneId), boneId }]));
  const segments = Object.fromEntries(hierarchy.flatMap((boneId) => {
    const parentId = parents[boneId];
    if (!parentId) return [];
    const groupId = groups?.find((group) => group.boneIds.includes(boneId))?.id ?? "skeleton";
    const id = `${parentId}--${boneId}`;
    return [[id, { id, name: humanizeEditorId(boneId), startJointId: parentId, endJointId: boneId, boneId, groupId }]];
  }));
  const fallbackGroup: EditorBoneGroup = { id: "skeleton", name: "Skeleton", boneIds: hierarchy.filter((boneId) => Boolean(parents[boneId])) };
  const normalizedGroups = groups?.length ? groups : [fallbackGroup];
  return {
    joints,
    segments,
    groups: Object.fromEntries(normalizedGroups.map((group) => [group.id, group])),
    activeGroupId: normalizedGroups[0]?.id ?? fallbackGroup.id
  };
}

const emptyProceduralState: ProceduralPresetState = {
  inputs: { velocityX: 0, velocityY: 0, gravity: 1, wind: 0, grounded: true, jumpStart: false, landHeavy: false },
  breathing: { enabled: false, frequency: 0.8, amplitude: 0, affectedBones: [], affectedBoneTransforms: {} },
  secondaryMotion: { enabled: false, target: "root", stiffness: 0, damping: 0, velocityInfluence: 0, gravityInfluence: 0, windInfluence: 0, maxOffset: 0 },
  squashStretch: { enabled: false, targetBone: "root", landingImpactScale: 0, rules: [] },
  footIk: { enabled: false, feet: [], footChains: [], maxCorrection: 0, blend: 0 }
};

export function createEmptyEditorProject(): EditorProjectState {
  const identity = createProjectIdentity();
  const hierarchy = ["root"] as const;
  const parents = { root: null } as const;
  return {
    ...identity,
    name: "Untitled Rig",
    characterKind: "human",
    selectedBoneId: "root",
    hierarchy,
    parents,
    bones: { root: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
    boneMetadata: {},
    boneLengths: { root: 0 },
    topology: createEditorTopology(hierarchy, parents, [{ id: "skeleton", name: "Skeleton", boneIds: [] }]),
    parts: {},
    visualSlots: {},
    skins: { default: { id: "default", name: "Default", attachments: {} } },
    activeSkinId: "default",
    ikChains: {},
    poses: {},
    poseClipboard: null,
    animations: {},
    timeline: { selectedClipId: "", selectedKeyIds: [], keyClipboard: [], autoKey: false, snappingFps: 60, virtualWindow: { startRow: 0, rowCount: 12 }, curvePreview: { fromClipId: "", toClipId: "", weight: 0 } },
    stateMachine: { initialStateId: "idle", states: [{ id: "idle", clipId: "" }], transitions: [], parameters: {}, preview: { fromStateId: "idle", toStateId: "idle", weight: 0 } },
    procedural: emptyProceduralState,
    dirtyScopes: cleanDirtyScopes,
    autosave: initialAutosaveState,
    dirty: false,
    dirtyParts: []
  };
}

export const initialEditorProject: EditorProjectState = {
  ...createProjectIdentity(),
  name: "Shadow Hero",
  characterKind: "human",
  selectedBoneId: "body",
  hierarchy: ["root", "body", "head", "upperArmBack", "forearmBack", "handBack", "upperArmFront", "forearmFront", "handFront", "pelvis", "thighBack", "shinBack", "footBack", "thighFront", "shinFront", "footFront"],
  parents: {
    root: null,
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
  boneMetadata: {},
  boneLengths: {},
  topology: createEditorTopology(
    ["root", "body", "head", "upperArmBack", "forearmBack", "handBack", "upperArmFront", "forearmFront", "handFront", "pelvis", "thighBack", "shinBack", "footBack", "thighFront", "shinFront", "footFront"],
    {
      root: null, body: "root", head: "body", upperArmBack: "body", forearmBack: "upperArmBack", handBack: "forearmBack",
      upperArmFront: "body", forearmFront: "upperArmFront", handFront: "forearmFront", pelvis: "body", thighBack: "pelvis",
      shinBack: "thighBack", footBack: "shinBack", thighFront: "pelvis", shinFront: "thighFront", footFront: "shinFront"
    }
  ),
  parts: {
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
  visualSlots: {},
  skins: { default: { id: "default", name: "Default", attachments: {} } },
  activeSkinId: "default",
  ikChains: {
    frontArm: { id: "frontArm", name: "Front arm", rootBoneId: "upperArmFront", middleBoneId: "forearmFront", endBoneId: "handFront", bendDirection: 1, poleAngle: -35, stretch: false },
    rearArm: { id: "rearArm", name: "Rear arm", rootBoneId: "upperArmBack", middleBoneId: "forearmBack", endBoneId: "handBack", bendDirection: -1, poleAngle: 35, stretch: false },
    frontLeg: { id: "frontLeg", name: "Front leg", rootBoneId: "thighFront", middleBoneId: "shinFront", endBoneId: "footFront", bendDirection: 1, poleAngle: -20, stretch: false },
    rearLeg: { id: "rearLeg", name: "Rear leg", rootBoneId: "thighBack", middleBoneId: "shinBack", endBoneId: "footBack", bendDirection: -1, poleAngle: 20, stretch: false }
  },
  poses: {
    idle_neutral: { id: "idle_neutral", name: "Idle neutral", boneTransforms: {}, tags: ["idle"] },
    breath_in: { id: "breath_in", name: "Breath in", boneTransforms: { body: { x: 0, y: -250, rotation: 0, scaleX: 1, scaleY: 1.025 } }, tags: ["idle"] },
    breath_out: { id: "breath_out", name: "Breath out", boneTransforms: { body: { x: 0, y: -248, rotation: 0, scaleX: 1, scaleY: 0.985 }, head: { x: 0, y: -92, rotation: -0.02, scaleX: 1, scaleY: 1 } }, tags: ["idle"] },
    walk_contact_left: { id: "walk_contact_left", name: "Walk contact left", boneTransforms: { thighFront: { x: 28, y: 20, rotation: -0.28, scaleX: 1, scaleY: 1 }, thighBack: { x: -27, y: 20, rotation: 0.22, scaleX: 1, scaleY: 1 } }, tags: ["walk"] },
    walk_pass_left: { id: "walk_pass_left", name: "Walk pass left", boneTransforms: { body: { x: 0, y: -244, rotation: 0, scaleX: 1, scaleY: 1 }, thighFront: { x: 28, y: 20, rotation: 0.08, scaleX: 1, scaleY: 1 }, thighBack: { x: -27, y: 20, rotation: -0.08, scaleX: 1, scaleY: 1 } }, tags: ["walk"] },
    walk_contact_right: { id: "walk_contact_right", name: "Walk contact right", boneTransforms: { thighFront: { x: 28, y: 20, rotation: 0.22, scaleX: 1, scaleY: 1 }, thighBack: { x: -27, y: 20, rotation: -0.28, scaleX: 1, scaleY: 1 } }, tags: ["walk"] },
    jump_start: { id: "jump_start", name: "Jump start", boneTransforms: { body: { x: 0, y: -244, rotation: -0.06, scaleX: 1.08, scaleY: 0.9 }, head: { x: 0, y: -92, rotation: 0.08, scaleX: 1, scaleY: 1 }, upperArmFront: { x: 48, y: -34, rotation: -0.9, scaleX: 1, scaleY: 1 }, upperArmBack: { x: -44, y: -34, rotation: -0.7, scaleX: 1, scaleY: 1 } }, tags: ["jump"] },
    jump_peak: { id: "jump_peak", name: "Jump peak", boneTransforms: { body: { x: 0, y: -286, rotation: -0.04, scaleX: 1, scaleY: 1.08 } }, tags: ["jump"] },
    fall_fast: { id: "fall_fast", name: "Fall fast", boneTransforms: { body: { x: 0, y: -268, rotation: 0.04, scaleX: 0.96, scaleY: 1.08 }, head: { x: 0, y: -94, rotation: -0.08, scaleX: 1, scaleY: 1 }, upperArmFront: { x: 48, y: -34, rotation: -1.16, scaleX: 1, scaleY: 1 }, upperArmBack: { x: -44, y: -34, rotation: -0.95, scaleX: 1, scaleY: 1 } }, tags: ["fall"] },
    land_heavy: { id: "land_heavy", name: "Land heavy", boneTransforms: { body: { x: 0, y: -244, rotation: 0.02, scaleX: 1.12, scaleY: 0.84 }, pelvis: { x: 0, y: 88, rotation: 0.06, scaleX: 1, scaleY: 1 }, thighFront: { x: 28, y: 20, rotation: -0.08, scaleX: 1, scaleY: 1 }, thighBack: { x: -27, y: 20, rotation: 0.1, scaleX: 1, scaleY: 1 } }, tags: ["land"] },
    turn_left_to_right: { id: "turn_left_to_right", name: "Turn left to right", boneTransforms: { root: { x: 0, y: 0, rotation: 0, scaleX: -1, scaleY: 1 }, body: { x: 0, y: -250, rotation: 0.05, scaleX: 1, scaleY: 1 } }, tags: ["turn"] },
    wall_slide: { id: "wall_slide", name: "Wall slide", boneTransforms: { body: { x: 0, y: -250, rotation: -0.12, scaleX: 1, scaleY: 1 }, upperArmFront: { x: 48, y: -34, rotation: -1.1, scaleX: 1, scaleY: 1 }, thighFront: { x: 28, y: 20, rotation: 0.38, scaleX: 1, scaleY: 1 } }, tags: ["wall", "fall"] }
  },
  poseClipboard: null,
  animations: {
    idle: {
      id: "idle",
      name: "Idle",
      duration: 1.2,
      frameRate: 60,
      loop: true,
      events: [],
      markers: [{ id: "idle-loop", time: 1.2, label: "Loop", color: "#4f8cff" }],
      tags: ["idle"],
      tracks: {
        "body.y": [{ id: "idle-body-y-0", time: 0, value: -250, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-body-y-1", time: 0.6, value: -251.2, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-body-y-2", time: 1.2, value: -250, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }],
        "body.scaleX": [{ id: "idle-body-sx-0", time: 0, value: 1, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-body-sx-1", time: 0.6, value: 0.992, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-body-sx-2", time: 1.2, value: 1, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }],
        "body.scaleY": [{ id: "idle-body-0", time: 0, value: 1, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-body-1", time: 0.6, value: 1.028, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-body-2", time: 1.2, value: 1, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }],
        "head.y": [{ id: "idle-head-y-0", time: 0, value: -94, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-head-y-1", time: 0.6, value: -94.8, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-head-y-2", time: 1.2, value: -94, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }],
        "head.rotation": [{ id: "idle-head-0", time: 0, value: -0.02, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-head-1", time: 0.6, value: 0.018, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-head-2", time: 1.2, value: -0.02, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }],
        "upperArmFront.rotation": [{ id: "idle-arm-f-0", time: 0, value: -0.05, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-arm-f-1", time: 0.6, value: -0.015, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-arm-f-2", time: 1.2, value: -0.05, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }],
        "upperArmBack.rotation": [{ id: "idle-arm-b-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-arm-b-1", time: 0.6, value: 0.045, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }, { id: "idle-arm-b-2", time: 1.2, value: 0.08, interpolation: "bezier", curve: [0.35, 0, 0.65, 1] }]
      }
    },
    walk: {
      id: "walk",
      name: "Walk",
      duration: 0.84,
      frameRate: 60,
      loop: true,
      events: [
        { id: "walk-foot-front", time: 0.04, type: "footstep", payload: { foot: "front", weight: 0.9 } },
        { id: "walk-foot-back", time: 0.46, type: "footstep", payload: { foot: "back", weight: 0.9 } }
      ],
      markers: [{ id: "walk-loop", time: 0.84, label: "Loop", color: "#4f8cff" }],
      tags: ["walk"],
      tracks: {
        "body.x": [{ id: "walk-body-x-0", time: 0, value: -1.5, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-body-x-1", time: 0.42, value: 1.5, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-body-x-2", time: 0.84, value: -1.5, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }],
        "body.y": [{ id: "walk-body-y-0", time: 0, value: -250, interpolation: "bezier", curve: [0.2, 0.8, 0.2, 1] }, { id: "walk-body-y-1", time: 0.21, value: -244, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }, { id: "walk-body-y-2", time: 0.42, value: -249, interpolation: "bezier", curve: [0.2, 0.8, 0.2, 1] }, { id: "walk-body-y-3", time: 0.63, value: -244, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }, { id: "walk-body-y-4", time: 0.84, value: -250, interpolation: "bezier", curve: [0.2, 0.8, 0.2, 1] }],
        "body.rotation": [{ id: "walk-body-r-0", time: 0, value: -0.025, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-body-r-1", time: 0.42, value: 0.025, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-body-r-2", time: 0.84, value: -0.025, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }],
        "pelvis.rotation": [{ id: "walk-pelvis-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-pelvis-1", time: 0.42, value: -0.08, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-pelvis-2", time: 0.84, value: 0.08, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }],
        "head.rotation": [{ id: "walk-head-0", time: 0, value: 0.035, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-head-1", time: 0.42, value: -0.03, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }, { id: "walk-head-2", time: 0.84, value: 0.035, interpolation: "bezier", curve: [0.3, 0, 0.7, 1] }],
        "upperArmFront.rotation": [{ id: "walk-arm-f-0", time: 0, value: 0.32, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-arm-f-1", time: 0.42, value: -0.34, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-arm-f-2", time: 0.84, value: 0.32, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "forearmFront.rotation": [{ id: "walk-forearm-f-0", time: 0, value: -0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-forearm-f-1", time: 0.42, value: 0.26, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-forearm-f-2", time: 0.84, value: -0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "upperArmBack.rotation": [{ id: "walk-arm-b-0", time: 0, value: -0.34, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-arm-b-1", time: 0.42, value: 0.32, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-arm-b-2", time: 0.84, value: -0.34, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "forearmBack.rotation": [{ id: "walk-forearm-b-0", time: 0, value: 0.24, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-forearm-b-1", time: 0.42, value: -0.16, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-forearm-b-2", time: 0.84, value: 0.24, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "thighFront.rotation": [{ id: "walk-thigh-f-0", time: 0, value: -0.36, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-f-1", time: 0.21, value: 0.1, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-f-2", time: 0.42, value: 0.34, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-f-3", time: 0.63, value: -0.12, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-f-4", time: 0.84, value: -0.36, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "shinFront.rotation": [{ id: "walk-shin-f-0", time: 0, value: 0.2, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-f-1", time: 0.21, value: -0.24, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-f-2", time: 0.42, value: 0.08, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-f-3", time: 0.63, value: 0.32, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-f-4", time: 0.84, value: 0.2, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "footFront.rotation": [{ id: "walk-foot-f-0", time: 0, value: 0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-f-1", time: 0.21, value: -0.1, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-f-2", time: 0.42, value: 0.28, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-f-3", time: 0.63, value: -0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-f-4", time: 0.84, value: 0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "thighBack.rotation": [{ id: "walk-thigh-b-0", time: 0, value: 0.34, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-b-1", time: 0.21, value: -0.12, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-b-2", time: 0.42, value: -0.36, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-b-3", time: 0.63, value: 0.1, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-thigh-b-4", time: 0.84, value: 0.34, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "shinBack.rotation": [{ id: "walk-shin-b-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-b-1", time: 0.21, value: 0.32, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-b-2", time: 0.42, value: 0.2, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-b-3", time: 0.63, value: -0.24, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-shin-b-4", time: 0.84, value: 0.08, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }],
        "footBack.rotation": [{ id: "walk-foot-b-0", time: 0, value: 0.28, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-b-1", time: 0.21, value: -0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-b-2", time: 0.42, value: 0.18, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-b-3", time: 0.63, value: -0.1, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }, { id: "walk-foot-b-4", time: 0.84, value: 0.28, interpolation: "bezier", curve: [0.25, 0, 0.35, 1] }]
      }
    },
    jump: { id: "jump", name: "Jump", duration: 0.56, frameRate: 60, loop: false, events: [{ id: "jump-anticipation", time: 0.08, type: "anticipation" }, { id: "jump-liftoff", time: 0.12, type: "liftoff" }], markers: [{ id: "jump-compress", time: 0.1, label: "Compress", color: "#f97316" }, { id: "jump-peak", time: 0.56, label: "Peak", color: "#8b5cf6" }], tags: ["jump"], tracks: { "body.y": [{ id: "jump-body-y-0", time: 0, value: -248, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-body-y-1", time: 0.1, value: -242, interpolation: "bezier", curve: [0.4, 0, 0.8, 1] }, { id: "jump-body-y-2", time: 0.28, value: -272, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-body-y-3", time: 0.56, value: -294, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "body.rotation": [{ id: "jump-body-r-0", time: 0, value: 0.04, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-body-r-1", time: 0.1, value: -0.08, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-body-r-2", time: 0.56, value: -0.03, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "body.scaleX": [{ id: "jump-scale-x-0", time: 0, value: 1.02, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-scale-x-1", time: 0.1, value: 1.12, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-scale-x-2", time: 0.28, value: 0.94, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-scale-x-3", time: 0.56, value: 0.98, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "body.scaleY": [{ id: "jump-scale-y-0", time: 0, value: 0.98, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-scale-y-1", time: 0.1, value: 0.82, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-scale-y-2", time: 0.28, value: 1.16, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-scale-y-3", time: 0.56, value: 1.06, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "head.rotation": [{ id: "jump-head-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-head-1", time: 0.28, value: -0.06, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-head-2", time: 0.56, value: -0.02, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "upperArmFront.rotation": [{ id: "jump-arm-f-0", time: 0, value: -0.58, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-arm-f-1", time: 0.28, value: -1.05, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-arm-f-2", time: 0.56, value: -0.84, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "forearmFront.rotation": [{ id: "jump-forearm-f-0", time: 0, value: 0.1, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-forearm-f-1", time: 0.28, value: -0.26, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-forearm-f-2", time: 0.56, value: -0.12, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "upperArmBack.rotation": [{ id: "jump-arm-b-0", time: 0, value: -0.48, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-arm-b-1", time: 0.28, value: -0.9, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-arm-b-2", time: 0.56, value: -0.72, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "forearmBack.rotation": [{ id: "jump-forearm-b-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-forearm-b-1", time: 0.28, value: -0.22, interpolation: "bezier", curve: [0.1, 0.8, 0.2, 1] }, { id: "jump-forearm-b-2", time: 0.56, value: -0.08, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "pelvis.rotation": [{ id: "jump-pelvis-0", time: 0, value: 0.06, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-pelvis-1", time: 0.1, value: -0.1, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-pelvis-2", time: 0.56, value: -0.04, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "thighFront.rotation": [{ id: "jump-thigh-f-0", time: 0, value: -0.18, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-thigh-f-1", time: 0.1, value: 0.28, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-thigh-f-2", time: 0.56, value: 0.42, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "shinFront.rotation": [{ id: "jump-shin-f-0", time: 0, value: 0.14, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-shin-f-1", time: 0.1, value: -0.32, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-shin-f-2", time: 0.56, value: -0.18, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "thighBack.rotation": [{ id: "jump-thigh-b-0", time: 0, value: 0.16, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-thigh-b-1", time: 0.1, value: -0.24, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-thigh-b-2", time: 0.56, value: 0.18, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "shinBack.rotation": [{ id: "jump-shin-b-0", time: 0, value: 0.18, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-shin-b-1", time: 0.1, value: 0.38, interpolation: "bezier", curve: [0.32, 0, 0.72, 1] }, { id: "jump-shin-b-2", time: 0.56, value: 0.22, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }] } },
    fall: { id: "fall", name: "Fall", duration: 0.6, frameRate: 60, loop: true, events: [], markers: [{ id: "fall-loop", time: 0.6, label: "Loop", color: "#4f8cff" }], tags: ["fall"], tracks: { "body.y": [{ id: "fall-body-y-0", time: 0, value: -286, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-body-y-1", time: 0.3, value: -270, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-body-y-2", time: 0.6, value: -254, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "body.rotation": [{ id: "fall-body-r-0", time: 0, value: -0.02, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-body-r-1", time: 0.3, value: 0.045, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-body-r-2", time: 0.6, value: 0.02, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "body.scaleX": [{ id: "fall-scale-x-0", time: 0, value: 0.98, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-scale-x-1", time: 0.3, value: 0.96, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-scale-x-2", time: 0.6, value: 0.98, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "body.scaleY": [{ id: "fall-scale-y-0", time: 0, value: 1.08, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-scale-y-1", time: 0.3, value: 1.12, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-scale-y-2", time: 0.6, value: 1.08, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "head.rotation": [{ id: "fall-head-0", time: 0, value: -0.05, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-head-1", time: 0.3, value: -0.1, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-head-2", time: 0.6, value: -0.06, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "upperArmFront.rotation": [{ id: "fall-arm-f-0", time: 0, value: -0.92, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-arm-f-1", time: 0.3, value: -1.18, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-arm-f-2", time: 0.6, value: -0.96, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "upperArmBack.rotation": [{ id: "fall-arm-b-0", time: 0, value: -0.76, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-arm-b-1", time: 0.3, value: -1, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-arm-b-2", time: 0.6, value: -0.8, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "thighFront.rotation": [{ id: "fall-thigh-f-0", time: 0, value: 0.34, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-thigh-f-1", time: 0.3, value: 0.44, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-thigh-f-2", time: 0.6, value: 0.36, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "shinFront.rotation": [{ id: "fall-shin-f-0", time: 0, value: -0.2, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-shin-f-1", time: 0.3, value: -0.32, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-shin-f-2", time: 0.6, value: -0.22, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "thighBack.rotation": [{ id: "fall-thigh-b-0", time: 0, value: 0.12, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-thigh-b-1", time: 0.3, value: 0.2, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-thigh-b-2", time: 0.6, value: 0.14, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }], "shinBack.rotation": [{ id: "fall-shin-b-0", time: 0, value: 0.2, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-shin-b-1", time: 0.3, value: 0.3, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }, { id: "fall-shin-b-2", time: 0.6, value: 0.22, interpolation: "bezier", curve: [0.3, 0, 0.65, 1] }] } },
    land: { id: "land", name: "Land", duration: 0.42, frameRate: 60, loop: false, events: [{ id: "land-impact", time: 0, type: "land", payload: { strength: 1 } }, { id: "land-recover", time: 0.28, type: "recover" }], markers: [{ id: "land-squash", time: 0, label: "Impact", color: "#f97316" }, { id: "land-recover", time: 0.42, label: "Recover", color: "#22c55e" }], tags: ["land"], tracks: { "body.y": [{ id: "land-body-y-0", time: 0, value: -244, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-body-y-1", time: 0.16, value: -251, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-body-y-2", time: 0.42, value: -250, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "body.rotation": [{ id: "land-body-r-0", time: 0, value: 0.04, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-body-r-1", time: 0.16, value: -0.02, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-body-r-2", time: 0.42, value: 0, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "body.scaleX": [{ id: "land-x-0", time: 0, value: 1.14, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-x-1", time: 0.16, value: 0.96, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-x-2", time: 0.42, value: 1, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "body.scaleY": [{ id: "land-y-0", time: 0, value: 0.82, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-y-1", time: 0.16, value: 1.06, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-y-2", time: 0.42, value: 1, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "head.rotation": [{ id: "land-head-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-head-1", time: 0.16, value: -0.04, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-head-2", time: 0.42, value: -0.01, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "upperArmFront.rotation": [{ id: "land-arm-f-0", time: 0, value: -0.34, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-arm-f-1", time: 0.16, value: 0.06, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-arm-f-2", time: 0.42, value: -0.05, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "upperArmBack.rotation": [{ id: "land-arm-b-0", time: 0, value: -0.2, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-arm-b-1", time: 0.16, value: 0.12, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-arm-b-2", time: 0.42, value: 0.08, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "pelvis.rotation": [{ id: "land-pelvis-0", time: 0, value: 0.08, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-pelvis-1", time: 0.16, value: -0.03, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-pelvis-2", time: 0.42, value: 0, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "thighFront.rotation": [{ id: "land-thigh-f-0", time: 0, value: -0.08, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-thigh-f-1", time: 0.16, value: -0.18, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-thigh-f-2", time: 0.42, value: -0.04, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "shinFront.rotation": [{ id: "land-shin-f-0", time: 0, value: 0.34, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-shin-f-1", time: 0.16, value: 0.12, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-shin-f-2", time: 0.42, value: 0.02, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "thighBack.rotation": [{ id: "land-thigh-b-0", time: 0, value: 0.12, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-thigh-b-1", time: 0.16, value: 0.02, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-thigh-b-2", time: 0.42, value: 0.04, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }], "shinBack.rotation": [{ id: "land-shin-b-0", time: 0, value: 0.26, interpolation: "bezier", curve: [0.18, 0, 0.5, 1] }, { id: "land-shin-b-1", time: 0.16, value: 0.08, interpolation: "bezier", curve: [0.2, 0.9, 0.2, 1] }, { id: "land-shin-b-2", time: 0.42, value: 0.02, interpolation: "bezier", curve: [0.2, 0, 0.2, 1] }] } }
  },
  timeline: { selectedClipId: "idle", selectedKeyIds: [], keyClipboard: [], autoKey: false, snappingFps: 60, virtualWindow: { startRow: 0, rowCount: 12 }, curvePreview: { fromClipId: "jump", toClipId: "land", weight: 0.5 } },
  stateMachine: {
    initialStateId: "idle",
    states: [
      { id: "idle", clipId: "idle" },
      { id: "locomotion", clipId: "walk", blendTree: { type: "1d", parameter: "absSpeed", children: [{ threshold: 0, clipId: "idle" }, { threshold: 80, clipId: "walk" }, { threshold: 150, clipId: "walk" }] }, tags: ["blendTree"] },
      { id: "walk", clipId: "walk" },
      { id: "jump", clipId: "jump" },
      { id: "fall", clipId: "fall" },
      { id: "land", clipId: "land" }
    ],
    transitions: [
      { id: "idle-walk", fromStateId: "idle", toStateId: "walk", duration: 0.18, easing: "easeOut", priority: 0, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameter: "absSpeed", op: ">", value: 12 }] },
      { id: "walk-idle", fromStateId: "walk", toStateId: "idle", duration: 0.16, easing: "easeInOut", priority: 0, canInterrupt: true, syncMode: "phaseMatch", conditions: [{ parameter: "absSpeed", op: "<=", value: 8 }] },
      { id: "any-jump", fromStateId: "idle", toStateId: "jump", duration: 0.08, easing: "anticipation", priority: 10, canInterrupt: true, syncMode: "none", conditions: [{ parameter: "jumpPressed", op: "==", value: true }] },
      { id: "jump-fall", fromStateId: "jump", toStateId: "fall", duration: 0.12, easing: "easeIn", priority: 5, canInterrupt: true, syncMode: "normalizedTime", conditions: [{ parameter: "velocityY", op: ">", value: 0 }] },
      { id: "fall-land", fromStateId: "fall", toStateId: "land", duration: 0.08, easing: "overshoot", priority: 8, canInterrupt: true, syncMode: "none", conditions: [{ parameter: "grounded", op: "==", value: true }] },
      { id: "land-idle", fromStateId: "land", toStateId: "idle", duration: 0.22, easing: "easeOut", priority: 0, canInterrupt: false, syncMode: "none", conditions: [{ parameter: "timeInState", op: ">", value: 0.2 }] }
    ],
    parameters: { speed: 0, absSpeed: 0, velocityX: 0, velocityY: 0, grounded: true, wasGrounded: true, landingImpact: 0, joystickX: 0, joystickY: 0, joystickMagnitude: 0, jumpPressed: false, attackPressed: false, facing: 1, wallContact: "none", timeInState: 0 },
    preview: { fromStateId: "idle", toStateId: "walk", weight: 0.5 }
  },
  procedural: {
    inputs: { velocityX: 0, velocityY: 0, gravity: 1, wind: 0, grounded: true, jumpStart: false, landHeavy: false },
    breathing: { enabled: true, frequency: 0.8, amplitude: 1, affectedBones: ["body", "head"], affectedBoneTransforms: { body: { scaleY: 0.025, y: -0.8 }, head: { y: -0.5 }, upperArmFront: { rotation: 0.025 }, upperArmBack: { rotation: -0.018 } } },
    secondaryMotion: { enabled: true, target: "head", stiffness: 0.22, damping: 0.72, velocityInfluence: 0.35, gravityInfluence: 0.18, windInfluence: 0.1, maxOffset: 8 },
    squashStretch: { enabled: true, targetBone: "body", landingImpactScale: 0.18, rules: [{ condition: "jumpStart", scaleX: 0.92, scaleY: 1.12, duration: 0.08 }, { condition: "landHeavy", scaleX: 1.14, scaleY: 0.82, duration: 0.12 }] },
    footIk: { enabled: false, feet: ["footFront"], footChains: [{ footBone: "footFront", shinBone: "shinFront", thighBone: "thighFront", raycastOffsetX: 4, raycastHeight: 20 }, { footBone: "footBack", shinBone: "shinBack", thighBone: "thighBack", raycastOffsetX: -4, raycastHeight: 20 }], maxCorrection: 8, blend: 0.75 }
  },
  dirtyScopes: cleanDirtyScopes,
  autosave: initialAutosaveState
};

export function executeCommand(container: EditorStateContainer, command: EditorCommand, options: ExecuteCommandOptions = {}): EditorStateContainer {
  const uiBefore = captureUiSnapshot(container.project);
  const nextProject = command.do(container.project);
  options.validate?.(nextProject);
  const record: EditorCommandRecord = { command, uiBefore, uiAfter: captureUiSnapshot(nextProject) };
  return {
    project: nextProject,
    history: { past: [...container.history.past, record], future: [] }
  };
}

export function undo(container: EditorStateContainer): EditorStateContainer {
  const record = container.history.past[container.history.past.length - 1];
  if (!record) {
    return container;
  }
  const project = restoreUiSnapshot(record.command.undo(container.project), record.uiBefore);
  return {
    project,
    history: {
      past: container.history.past.slice(0, -1),
      future: [record, ...container.history.future]
    }
  };
}

export function redo(container: EditorStateContainer): EditorStateContainer {
  const record = container.history.future[0];
  if (!record) {
    return container;
  }
  const project = restoreUiSnapshot(record.command.do(container.project), record.uiAfter);
  return {
    project,
    history: {
      past: [...container.history.past, record],
      future: container.history.future.slice(1)
    }
  };
}

export function createGroupedCommand(label: string, commands: readonly EditorCommand[]): EditorCommand {
  return {
    id: `group:${commands.map((command) => command.id).join("+")}`,
    label,
    do: (state) => commands.reduce((nextState, command) => command.do(nextState), state),
    undo: (state) => [...commands].reverse().reduce((nextState, command) => command.undo(nextState), state)
  };
}

export function beginProjectTransaction(container: EditorStateContainer, label: string): ProjectTransaction {
  return { label, base: container, current: container, commands: [] };
}

export function applyTransactionCommand(transaction: ProjectTransaction, command: EditorCommand, options: ExecuteCommandOptions = {}): ProjectTransaction {
  return {
    ...transaction,
    current: executeCommand(transaction.current, command, options),
    commands: [...transaction.commands, command]
  };
}

export function commitProjectTransaction(transaction: ProjectTransaction, options: ExecuteCommandOptions = {}): EditorStateContainer {
  if (!transaction.commands.length) {
    return transaction.base;
  }
  return executeCommand(transaction.base, createGroupedCommand(transaction.label, transaction.commands), options);
}

export function rollbackProjectTransaction(transaction: ProjectTransaction): EditorStateContainer {
  return transaction.base;
}

export function markAutosaveSaved(project: EditorProjectState, savedAt = Date.now()): EditorProjectState {
  return { ...project, autosave: { ...project.autosave, status: "saved", lastSavedAt: savedAt } };
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
      bones: { ...state.bones, [boneId]: transform },
      boneLengths: { ...state.boneLengths, [boneId]: 0 },
      topology: addJointToTopology(state.topology, boneId)
    }),
    undo: (state) => removeBone(state, boneId, parentId)
  };
}

export function createAddJointCommand(boneId: string, position: readonly [number, number]): EditorCommand {
  let previous: EditorProjectState | undefined;
  return {
    id: `add-joint:${boneId}`,
    label: "Add joint",
    do: (state) => {
      if (state.bones[boneId]) return state;
      previous = state;
      const transform: BoneTransform = { x: position[0], y: position[1], rotation: 0, scaleX: 1, scaleY: 1 };
      return {
        ...markDirty(state, boneId, "bones"),
        selectedBoneId: boneId,
        hierarchy: [...state.hierarchy, boneId],
        parents: { ...state.parents, [boneId]: state.hierarchy[0] ?? "root" },
        bones: { ...state.bones, [boneId]: transform },
        boneLengths: { ...state.boneLengths, [boneId]: 0 },
        topology: addJointToTopology(state.topology, boneId)
      };
    },
    undo: () => previous ?? initialEditorProject
  };
}

export function createConnectJointsCommand(
  startJointId: string,
  endJointId: string,
  groupId: string,
  endWorldPosition?: readonly [number, number]
): EditorCommand {
  let previous: EditorProjectState | undefined;
  return {
    id: `connect-joints:${startJointId}:${endJointId}`,
    label: "Create bone",
    do: (state) => {
      if (!state.bones[startJointId] || startJointId === endJointId || wouldCreateCycle(state.parents, endJointId, startJointId)) return state;
      previous = state;
      const topology = ensureTopologyGroup(state.topology, groupId);
      const startWorld = calculateBoneWorldPosition(state, startJointId);
      const parentRotation = calculateBoneWorldRotation(state, startJointId);
      const targetWorld = endWorldPosition ?? calculateBoneWorldPosition(state, endJointId);
      const dx = targetWorld[0] - startWorld[0];
      const dy = targetWorld[1] - startWorld[1];
      const cos = Math.cos(-parentRotation);
      const sin = Math.sin(-parentRotation);
      const local: BoneTransform = {
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
        rotation: state.bones[endJointId]?.rotation ?? 0,
        scaleX: state.bones[endJointId]?.scaleX ?? 1,
        scaleY: state.bones[endJointId]?.scaleY ?? 1
      };
      const isNew = !state.bones[endJointId];
      const hierarchy = isNew ? [...state.hierarchy, endJointId] : state.hierarchy;
      const nextTopology = connectTopologyJoints(addJointToTopology(topology, endJointId), startJointId, endJointId, groupId);
      return {
        ...markDirty(state, endJointId, "bones"),
        selectedBoneId: endJointId,
        hierarchy,
        parents: { ...state.parents, [endJointId]: startJointId },
        bones: { ...state.bones, [endJointId]: local },
        boneLengths: { ...state.boneLengths, [endJointId]: Math.hypot(dx, dy) },
        topology: nextTopology
      };
    },
    undo: () => previous ?? initialEditorProject
  };
}

export function createBoneGroupCommand(id: string, name: string): EditorCommand {
  let previous: EditorRigTopology | undefined;
  return {
    id: `add-bone-group:${id}`,
    label: "Add bone group",
    do: (state) => {
      if (state.topology.groups[id]) return state;
      previous = state.topology;
      return {
        ...markDirty(state, id, "bones"),
        topology: { ...state.topology, groups: { ...state.topology.groups, [id]: { id, name, boneIds: [] } }, activeGroupId: id }
      };
    },
    undo: (state) => previous ? { ...markDirty(state, id, "bones"), topology: previous } : state
  };
}

export function createUpdateBoneGroupCommand(groupId: string, patch: Partial<Omit<EditorBoneGroup, "id">>): EditorCommand {
  let previous: EditorBoneGroup | undefined;
  return {
    id: `update-bone-group:${groupId}`,
    label: "Update bone group",
    do: (state) => {
      const group = state.topology.groups[groupId];
      if (!group) return state;
      previous = group;
      return { ...markDirty(state, groupId, "bones"), topology: { ...state.topology, groups: { ...state.topology.groups, [groupId]: { ...group, ...patch } } } };
    },
    undo: (state) => previous ? { ...markDirty(state, groupId, "bones"), topology: { ...state.topology, groups: { ...state.topology.groups, [groupId]: previous } } } : state
  };
}

export function createMoveBoneToGroupCommand(boneId: string, groupId: string): EditorCommand {
  let previous: EditorRigTopology | undefined;
  return {
    id: `move-bone-group:${boneId}:${groupId}`,
    label: "Move bone to group",
    do: (state) => {
      if (!state.bones[boneId] || !state.topology.groups[groupId]) return state;
      previous = state.topology;
      const groups = Object.fromEntries(Object.entries(state.topology.groups).map(([id, group]) => [id, {
        ...group,
        boneIds: id === groupId ? [...new Set([...group.boneIds, boneId])] : group.boneIds.filter((id) => id !== boneId)
      }]));
      const segments = Object.fromEntries(Object.entries(state.topology.segments).map(([id, segment]) => [id, segment.boneId === boneId ? { ...segment, groupId } : segment]));
      return { ...markDirty(state, boneId, "bones"), topology: { ...state.topology, groups, segments, activeGroupId: groupId } };
    },
    undo: (state) => previous ? { ...markDirty(state, boneId, "bones"), topology: previous } : state
  };
}

export function createSetActiveBoneGroupCommand(groupId: string): EditorCommand {
  let previous = "";
  return {
    id: `set-active-bone-group:${groupId}`,
    label: "Set active bone group",
    do: (state) => {
      if (!state.topology.groups[groupId]) return state;
      previous = state.topology.activeGroupId;
      return { ...state, topology: { ...state.topology, activeGroupId: groupId } };
    },
    undo: (state) => state.topology.groups[previous] ? { ...state, topology: { ...state.topology, activeGroupId: previous } } : state
  };
}

export function createDeleteBoneCommand(boneId: string): EditorCommand {
  let previous: EditorProjectState | undefined;
  return {
    id: `delete-bone:${boneId}`,
    label: "Delete bone",
    do: (state) => {
      previous = state;
      return removeBone(state, boneId, state.parents[boneId] ?? "root");
    },
    undo: () => previous ?? initialEditorProject
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
  let previousParent: string | null | undefined;
  return {
    id: `set-parent:${boneId}:${parentId ?? "root"}`,
    label: "Set parent",
    do: (state) => {
      previousParent = state.parents[boneId] ?? null;
      return { ...markDirty(state, boneId, "bones"), parents: { ...state.parents, [boneId]: parentId } };
    },
    undo: (state) => (previousParent !== undefined ? { ...markDirty(state, boneId, "bones"), parents: { ...state.parents, [boneId]: previousParent } } : state)
  };
}

export function createSetBoneTransformCommand(boneId: string, transform: BoneTransform): EditorCommand {
  let previous: BoneTransform | undefined;
  return {
    id: `set-bone-transform:${boneId}`,
    label: "Set bone transform",
    do: (state) => {
      previous = state.bones[boneId];
      return { ...markDirty(state, boneId), bones: { ...state.bones, [boneId]: transform } };
    },
    undo: (state) => (previous ? { ...markDirty(state, boneId), bones: { ...state.bones, [boneId]: previous } } : state)
  };
}

export function createSetBoneTransformsCommand(transforms: Readonly<Record<string, BoneTransform>>, label = "Set bone transforms"): EditorCommand {
  let previous: Readonly<Record<string, BoneTransform>> | undefined;
  const boneIds = Object.keys(transforms);
  return {
    id: `set-bone-transforms:${boneIds.join(":")}`,
    label,
    do: (state) => {
      const validIds = boneIds.filter((boneId) => Boolean(state.bones[boneId]));
      if (!validIds.length) return state;
      previous = Object.fromEntries(validIds.map((boneId) => [boneId, state.bones[boneId]!]));
      let next = state;
      for (const boneId of validIds) next = markDirty(next, boneId, "bones");
      return { ...next, bones: { ...state.bones, ...Object.fromEntries(validIds.map((boneId) => [boneId, transforms[boneId]!])) } };
    },
    undo: (state) => (previous ? { ...markDirty(state, boneIds[0] ?? "bones", "bones"), bones: { ...state.bones, ...previous } } : state)
  };
}

export function createSetActiveSkinCommand(skinId: string): EditorCommand {
  let previous = "";
  return {
    id: `set-active-skin:${skinId}`,
    label: "Set active skin",
    do: (state) => {
      if (!state.skins[skinId]) return state;
      previous = state.activeSkinId;
      return { ...markDirty(state, skinId, "project"), activeSkinId: skinId };
    },
    undo: (state) => (state.skins[previous] ? { ...markDirty(state, previous, "project"), activeSkinId: previous } : state)
  };
}

export function createSkinCommand(id: string, name: string, sourceSkinId?: string): EditorCommand {
  return {
    id: `create-skin:${id}`,
    label: "Create skin",
    do: (state) => {
      if (state.skins[id]) return state;
      const source = state.skins[sourceSkinId ?? state.activeSkinId];
      return {
        ...markDirty(state, id, "project"),
        skins: { ...state.skins, [id]: { id, name, attachments: { ...(source?.attachments ?? {}) } } },
        activeSkinId: id
      };
    },
    undo: (state) => {
      const { [id]: _removed, ...skins } = state.skins;
      const activeSkinId = sourceSkinId && skins[sourceSkinId] ? sourceSkinId : Object.keys(skins)[0] ?? "default";
      return { ...markDirty(state, id, "project"), skins, activeSkinId };
    }
  };
}

export function createRenameSkinCommand(skinId: string, name: string): EditorCommand {
  let previous = "";
  return {
    id: `rename-skin:${skinId}`,
    label: "Rename skin",
    do: (state) => {
      const skin = state.skins[skinId];
      if (!skin) return state;
      previous = skin.name;
      return { ...markDirty(state, skinId, "project"), skins: { ...state.skins, [skinId]: { ...skin, name } } };
    },
    undo: (state) => {
      const skin = state.skins[skinId];
      return skin ? { ...markDirty(state, skinId, "project"), skins: { ...state.skins, [skinId]: { ...skin, name: previous } } } : state;
    }
  };
}

export function createSetSkinAttachmentCommand(skinId: string, slotId: string, partId: string | null): EditorCommand {
  let previous: string | null | undefined;
  return {
    id: `set-skin-attachment:${skinId}:${slotId}:${partId ?? "hidden"}`,
    label: "Set skin attachment",
    do: (state) => {
      const skin = state.skins[skinId];
      if (!skin || !state.visualSlots[slotId] || (partId !== null && !state.parts[partId])) return state;
      previous = skin.attachments[slotId];
      return { ...markDirty(state, slotId, "parts"), skins: { ...state.skins, [skinId]: { ...skin, attachments: { ...skin.attachments, [slotId]: partId } } } };
    },
    undo: (state) => {
      const skin = state.skins[skinId];
      if (!skin) return state;
      const attachments = { ...skin.attachments };
      if (previous === undefined) delete attachments[slotId];
      else attachments[slotId] = previous;
      return { ...markDirty(state, slotId, "parts"), skins: { ...state.skins, [skinId]: { ...skin, attachments } } };
    }
  };
}

export function createSetVisualSlotOrderCommand(slotIds: readonly string[]): EditorCommand {
  let previousSlots: Readonly<Record<string, EditorVisualSlot>> | undefined;
  let previousParts: Readonly<Record<string, ShapePart>> | undefined;
  return {
    id: `set-slot-order:${slotIds.join(":")}`,
    label: "Reorder visual layers",
    do: (state) => {
      const orderedIds = slotIds.filter((slotId) => Boolean(state.visualSlots[slotId]));
      if (!orderedIds.length) return state;
      previousSlots = state.visualSlots;
      previousParts = state.parts;
      const visualSlots = { ...state.visualSlots };
      const parts = { ...state.parts };
      orderedIds.forEach((slotId, drawOrder) => {
        const slot = visualSlots[slotId]!;
        visualSlots[slotId] = { ...slot, drawOrder };
        for (const skin of Object.values(state.skins)) {
          const partId = skin.attachments[slotId];
          if (partId && parts[partId]) parts[partId] = { ...parts[partId]!, zIndex: drawOrder, boneId: slot.boneId };
        }
      });
      return { ...markDirty(state, "visual-slots", "parts"), visualSlots, parts };
    },
    undo: (state) => (previousSlots && previousParts ? { ...markDirty(state, "visual-slots", "parts"), visualSlots: previousSlots, parts: previousParts } : state)
  };
}

export function createSetVisualSlotBoneCommand(slotId: string, boneId: string): EditorCommand {
  let previousSlot: EditorVisualSlot | undefined;
  let previousParts: Readonly<Record<string, ShapePart>> | undefined;
  return {
    id: `bind-slot:${slotId}:${boneId}`,
    label: "Bind artwork",
    do: (state) => {
      const slot = state.visualSlots[slotId];
      if (!slot || !state.bones[boneId]) return state;
      previousSlot = slot;
      previousParts = state.parts;
      const attachedPartIds = new Set(Object.values(state.skins).map((skin) => skin.attachments[slotId]).filter((id): id is string => Boolean(id)));
      const parts = Object.fromEntries(Object.entries(state.parts).map(([partId, part]) => [partId, attachedPartIds.has(partId) ? { ...part, boneId } : part]));
      return { ...markDirty(state, slotId, "parts"), visualSlots: { ...state.visualSlots, [slotId]: { ...slot, boneId } }, parts };
    },
    undo: (state) => previousSlot && previousParts ? { ...markDirty(state, slotId, "parts"), visualSlots: { ...state.visualSlots, [slotId]: previousSlot }, parts: previousParts } : state
  };
}

export function createUpdateIkChainCommand(chainId: string, patch: Partial<EditorIkChain>): EditorCommand {
  let previous: EditorIkChain | undefined;
  return {
    id: `update-ik-chain:${chainId}`,
    label: "Update IK chain",
    do: (state) => {
      const chain = state.ikChains[chainId];
      if (!chain) return state;
      previous = chain;
      return { ...markDirty(state, chainId, "bones"), ikChains: { ...state.ikChains, [chainId]: { ...chain, ...patch, id: chain.id } } };
    },
    undo: (state) => (previous ? { ...markDirty(state, chainId, "bones"), ikChains: { ...state.ikChains, [chainId]: previous } } : state)
  };
}

export function createSetBoneMetadataCommand(boneId: string, metadata: BoneMetadataPatch): EditorCommand {
  let previous: BoneMetadata | undefined;
  return {
    id: `set-bone-metadata:${boneId}`,
    label: "Set bone metadata",
    do: (state) => {
      previous = state.boneMetadata[boneId];
      return { ...markDirty(state, boneId), boneMetadata: { ...state.boneMetadata, [boneId]: mergeBoneMetadata(state.boneMetadata[boneId], metadata) } };
    },
    undo: (state) => {
      const nextMetadata = { ...state.boneMetadata };
      if (previous) {
        nextMetadata[boneId] = previous;
      } else {
        delete nextMetadata[boneId];
      }
      return { ...markDirty(state, boneId), boneMetadata: nextMetadata };
    }
  };
}

export function createMirrorBoneTransformCommand(sourceBoneId: string, targetBoneId = mirrorBoneId(sourceBoneId)): EditorCommand {
  let previous: BoneTransform | undefined;
  return {
    id: `mirror-bone-transform:${sourceBoneId}:${targetBoneId}`,
    label: "Mirror bone transform",
    do: (state) => {
      const source = state.bones[sourceBoneId];
      const target = state.bones[targetBoneId];
      if (!source || !target || sourceBoneId === targetBoneId) {
        return state;
      }
      previous = target;
      return {
        ...markDirty(state, targetBoneId, "bones"),
        bones: {
          ...state.bones,
          [targetBoneId]: mirrorTransform(source)
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, targetBoneId, "bones"), bones: { ...state.bones, [targetBoneId]: previous } } : state)
  };
}

export function createMirrorBoneBranchCommand(sourceBoneId: string): EditorCommand {
  let previous: Readonly<Record<string, BoneTransform>> | undefined;
  return {
    id: `mirror-bone-branch:${sourceBoneId}`,
    label: "Mirror bone branch",
    do: (state) => {
      const sourceIds = [sourceBoneId, ...getDescendantBoneIds(state, sourceBoneId)];
      const pairs = sourceIds
        .map((sourceId) => [sourceId, mirrorBoneId(sourceId)] as const)
        .filter(([sourceId, targetId]) => sourceId !== targetId && Boolean(state.bones[sourceId]) && Boolean(state.bones[targetId]));
      if (!pairs.length) {
        return state;
      }
      previous = Object.fromEntries(pairs.map(([, targetId]) => [targetId, state.bones[targetId]!]));
      const nextBones = { ...state.bones };
      let nextState = state;
      for (const [sourceId, targetId] of pairs) {
        nextBones[targetId] = mirrorTransform(state.bones[sourceId]!);
        nextState = markDirty(nextState, targetId, "bones");
      }
      return { ...nextState, bones: nextBones };
    },
    undo: (state) => (previous ? { ...markDirty(state, sourceBoneId, "bones"), bones: { ...state.bones, ...previous } } : state)
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

export function createAddSvgPartCommand(part: ShapePart): EditorCommand {
  let previous: ShapePart | undefined;
  return {
    id: `add-svg-part:${part.id}`,
    label: "Add SVG part",
    do(state) {
      previous = state.parts[part.id];
      if (!state.bones[part.boneId]) {
        return state;
      }
      return { ...markDirty(state, part.id), parts: { ...state.parts, [part.id]: part } };
    },
    undo(state) {
      if (previous) {
        return { ...markDirty(state, part.id, "parts"), parts: { ...state.parts, [part.id]: previous } };
      }
      const { [part.id]: _removed, ...parts } = state.parts;
      return { ...markDirty(state, part.id, "parts"), parts };
    }
  };
}

export function createBindPartToBoneCommand(partId: string, boneId: string): EditorCommand {
  let previousBoneId: string | undefined;
  return {
    id: `bind-existing-part:${partId}:${boneId}`,
    label: "Bind part to bone",
    do(state) {
      const part = state.parts[partId];
      if (!part || !state.bones[boneId]) {
        return state;
      }
      previousBoneId = part.boneId;
      return { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, boneId } } };
    },
    undo(state) {
      const part = state.parts[partId];
      return part && previousBoneId ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, boneId: previousBoneId } } } : state;
    }
  };
}

export function createEditPathPointCommand(partId: string, index: number, point?: readonly [number, number]): EditorCommand {
  let previous: ShapePart | undefined;
  const update = (state: EditorProjectState, nextPoint: readonly [number, number] | undefined) => {
    const part = state.parts[partId];
    if (!part) {
      return state;
    }
    previous = previous ?? part;
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
    undo: (state) => (previous ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: previous } } : state)
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

export function createSetPathClosedCommand(partId: string, closed: boolean): EditorCommand {
  return createUpdatePartPathCommand(partId, closed ? "Close path" : "Open path", (commands) => (closed ? closeVectorPath(commands) : openVectorPath(commands)));
}

export function createReversePartPathCommand(partId: string): EditorCommand {
  return createUpdatePartPathCommand(partId, "Reverse path", reverseVectorPath);
}

export function createSimplifyPartPathCommand(partId: string, epsilon = 0.01): EditorCommand {
  return createUpdatePartPathCommand(partId, "Simplify path", (commands) => simplifyVectorPath(commands, epsilon));
}

export function createSmoothPartPathCommand(partId: string, factor = 0.2): EditorCommand {
  return createUpdatePartPathCommand(partId, "Smooth path", (commands) => smoothVectorPath(commands, factor));
}

export function createConvertLineToCubicCommand(partId: string, commandIndex: number): EditorCommand {
  return createUpdatePartPathCommand(partId, "Convert line to cubic", (commands) => convertLineToSmoothCubic(commands, commandIndex));
}

function withPointPath(part: ShapePart, points: readonly (readonly [number, number])[]): ShapePart {
  const { pathCommands: _pathCommands, ...pointPart } = part;
  return { ...pointPart, type: "path", points };
}

function createUpdatePartPathCommand(partId: string, label: string, updater: (commands: readonly VectorPathCommand[]) => readonly VectorPathCommand[]): EditorCommand {
  let previous: ShapePart | undefined;
  return {
    id: `${label.toLowerCase().replaceAll(" ", "-")}:${partId}`,
    label,
    do: (state) => {
      const part = state.parts[partId];
      if (!part) {
        return state;
      }
      previous = part;
      const vectorCommands = toVectorPathCommands(part.pathCommands ?? pointsToSchemaPath(part.points)).filter((command) => command.cmd !== "Z" || part.points.length > 0);
      const pathCommands = updater(vectorCommands).map(toSchemaPathCommand);
      return {
        ...markDirty(state, partId, "parts"),
        parts: {
          ...state.parts,
          [partId]: {
            ...part,
            type: "path",
            points: pathCommandsToPoints(pathCommands),
            pathCommands
          }
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: previous } } : state)
  };
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

export function createUpdatePartTransformCommand(
  partId: string,
  patch: Pick<Partial<ShapePart>, "offset" | "rotation" | "scale" | "opacity" | "pivot">
): EditorCommand {
  let previous: ShapePart | undefined;
  return {
    id: `update-part-transform:${partId}`,
    label: "Update attachment transform",
    do: (state) => {
      const part = state.parts[partId];
      if (!part) return state;
      previous = part;
      return { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, ...patch } } };
    },
    undo: (state) => previous ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: previous } } : state
  };
}

export function createSetPartMeshCommand(partId: string, mesh: MeshShape): EditorCommand {
  let previous: ShapePart | undefined;
  return {
    id: `set-part-mesh:${partId}`,
    label: "Create mesh",
    do: (state) => {
      const part = state.parts[partId];
      if (!part || hasPartDeformTracks(state, partId)) return state;
      previous = part;
      return { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, type: "mesh", mesh } } };
    },
    undo: (state) => previous ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: previous } } : state
  };
}

export function createSetMeshVertexCommand(partId: string, vertexIndex: number, point: readonly [number, number]): EditorCommand {
  let previous: readonly number[] | undefined;
  return {
    id: `set-mesh-vertex:${partId}:${vertexIndex}`,
    label: "Move mesh vertex",
    do: (state) => {
      const part = state.parts[partId];
      if (!part?.mesh || vertexIndex < 0 || vertexIndex * 2 + 1 >= part.mesh.vertices.length) return state;
      previous = part.mesh.vertices;
      const vertices = [...part.mesh.vertices];
      vertices[vertexIndex * 2] = point[0];
      vertices[vertexIndex * 2 + 1] = point[1];
      return { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, mesh: { ...part.mesh, vertices } } } };
    },
    undo: (state) => {
      const part = state.parts[partId];
      return previous && part?.mesh ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, mesh: { ...part.mesh, vertices: previous } } } } : state;
    }
  };
}

export function createSetMeshSkinCommand(partId: string, skin: NonNullable<MeshShape["skin"]>, label = "Update mesh weights"): EditorCommand {
  let previous: NonNullable<MeshShape["skin"]> | undefined;
  return {
    id: `set-mesh-skin:${partId}`,
    label,
    do: (state) => {
      const part = state.parts[partId];
      if (!part?.mesh || skin.length !== part.mesh.vertices.length / 2) return state;
      previous = part.mesh.skin ?? [];
      return { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, mesh: { ...part.mesh, skin: normalizeMeshSkin(skin) } } } };
    },
    undo: (state) => {
      const part = state.parts[partId];
      return previous && part?.mesh ? { ...markDirty(state, partId, "parts"), parts: { ...state.parts, [partId]: { ...part, mesh: { ...part.mesh, skin: previous } } } } : state;
    }
  };
}

export function createClearPartDeformKeysCommand(partId: string): EditorCommand {
  let previous: Readonly<Record<string, AnimationClip>> | undefined;
  return {
    id: `clear-part-deform:${partId}`,
    label: "Clear deform keys",
    do: (state) => {
      previous = state.animations;
      const trackId = `${partId}.deform`;
      return {
        ...markDirty(state, partId, "animations"),
        animations: Object.fromEntries(Object.entries(state.animations).map(([clipId, clip]) => {
          const { [trackId]: _removed, ...tracks } = clip.tracks;
          return [clipId, { ...clip, tracks }];
        }))
      };
    },
    undo: (state) => previous ? { ...markDirty(state, partId, "animations"), animations: previous } : state
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
  let previousParts: Readonly<Record<string, ShapePart>> = {};
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
      previousParts = Object.fromEntries(
        Object.keys({ ...(pose.deforms ?? {}), ...(pose.partProperties ?? {}) })
          .map((partId): [string, ShapePart | undefined] => [partId, state.parts[partId]])
          .filter((entry): entry is [string, ShapePart] => Boolean(entry[1]))
      );
      return {
        ...markDirty(state, poseId, "poses"),
        bones: { ...state.bones, ...pose.boneTransforms },
        parts: applyPoseParts(state.parts, pose)
      };
    },
    undo: (state) => ({ ...markDirty(state, poseId, "poses"), bones: { ...state.bones, ...previous }, parts: { ...state.parts, ...previousParts } })
  };
}

export function createApplyPoseBlendCommand(poseId: string, weight: number): EditorCommand {
  let previous: Readonly<Record<string, BoneTransform>> = {};
  const clamped = Math.max(0, Math.min(1, weight));
  return {
    id: `apply-pose-blend:${poseId}:${clamped}`,
    label: "Apply pose blend",
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
        ...markDirty(state, poseId, "poses"),
        bones: {
          ...state.bones,
          ...Object.fromEntries(
            Object.entries(pose.boneTransforms).flatMap(([boneId, target]) => {
              const current = state.bones[boneId];
              return current ? [[boneId, blendTransform(current, target, clamped)] as const] : [];
            })
          )
        }
      };
    },
    undo: (state) => ({ ...markDirty(state, poseId, "poses"), bones: { ...state.bones, ...previous } })
  };
}

export function createPoseFromCurrentCommand(poseId: string, name: string, tags: readonly string[] = []): EditorCommand {
  return {
    id: `create-pose:${poseId}`,
    label: "Create pose",
    do: (state) =>
      state.poses[poseId]
        ? state
        : {
            ...markDirty(state, poseId, "poses"),
            poses: {
              ...state.poses,
              [poseId]: {
                id: poseId,
                name,
                boneTransforms: state.bones,
                deforms: Object.fromEntries(Object.entries(state.parts).filter(([, part]) => part.points.length).map(([partId, part]) => [partId, part.points])),
                partProperties: Object.fromEntries(Object.entries(state.parts).map(([partId, part]) => [partId, { drawOrder: part.zIndex ?? 0 }])),
                tags
              }
            }
          },
    undo: (state) => {
      const { [poseId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, poseId, "poses"), poses };
    }
  };
}

export function createRenamePoseCommand(poseId: string, name: string): EditorCommand {
  let previousName: string | undefined;
  return {
    id: `rename-pose:${poseId}`,
    label: "Rename pose",
    do: (state) => {
      const pose = state.poses[poseId];
      previousName = pose?.name;
      return pose ? { ...markDirty(state, poseId, "poses"), poses: { ...state.poses, [poseId]: { ...pose, name } } } : state;
    },
    undo: (state) => {
      const pose = state.poses[poseId];
      return pose && previousName ? { ...markDirty(state, poseId, "poses"), poses: { ...state.poses, [poseId]: { ...pose, name: previousName } } } : state;
    }
  };
}

export function createDuplicatePoseCommand(poseId: string, nextId: string): EditorCommand {
  return {
    id: `duplicate-pose:${poseId}:${nextId}`,
    label: "Duplicate pose",
    do: (state) => {
      const pose = state.poses[poseId];
      return pose ? { ...markDirty(state, nextId, "poses"), poses: { ...state.poses, [nextId]: { ...clonePose(pose), id: nextId, name: `${pose.name} Copy` } } } : state;
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId, "poses"), poses };
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
      const boneTransforms = Object.fromEntries(Object.entries(pose.boneTransforms).map(([boneId, transform]) => [mirrorBoneId(boneId), { ...transform, x: -transform.x, rotation: -transform.rotation }]));
      return { ...markDirty(state, nextId, "poses"), poses: { ...state.poses, [nextId]: { ...clonePose(pose), id: nextId, name: `${pose.name} Mirrored`, boneTransforms } } };
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId, "poses"), poses };
    }
  };
}

export function createBlendPoseCommand(fromPoseId: string, toPoseId: string, nextId: string, weight: number): EditorCommand {
  const clamped = Math.max(0, Math.min(1, weight));
  return {
    id: `blend-pose:${fromPoseId}:${toPoseId}:${nextId}:${clamped}`,
    label: "Blend pose",
    do: (state) => {
      const fromPose = state.poses[fromPoseId];
      const toPose = state.poses[toPoseId];
      if (!fromPose || !toPose || state.poses[nextId]) {
        return state;
      }
      const boneIds = Array.from(new Set([...Object.keys(fromPose.boneTransforms), ...Object.keys(toPose.boneTransforms)]));
      const boneTransforms = Object.fromEntries(
        boneIds.flatMap((boneId) => {
          const from = fromPose.boneTransforms[boneId] ?? state.bones[boneId];
          const to = toPose.boneTransforms[boneId] ?? state.bones[boneId];
          return from && to ? [[boneId, blendTransform(from, to, clamped)] as const] : [];
        })
      );
      return {
        ...markDirty(state, nextId, "poses"),
        poses: {
          ...state.poses,
          [nextId]: {
            id: nextId,
            name: `${fromPose.name} -> ${toPose.name} ${(clamped * 100).toFixed(0)}%`,
            boneTransforms,
            tags: Array.from(new Set([...fromPose.tags, ...toPose.tags, "blend"]))
          }
        }
      };
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId, "poses"), poses };
    }
  };
}

export function createPoseToKeyframesCommand(poseId: string, clipId: string, time: number): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `pose-to-keys:${poseId}:${clipId}:${time}`,
    label: "Key pose",
    do: (state) => {
      const pose = state.poses[poseId];
      const clip = state.animations[clipId];
      if (!pose || !clip) {
        return state;
      }
      previous = clip;
      const nextTracks: Record<string, readonly Keyframe[]> = { ...clip.tracks };
      for (const [boneId, transform] of Object.entries(pose.boneTransforms)) {
        for (const property of ["x", "y", "rotation", "scaleX", "scaleY"] as const) {
          const trackId = `${boneId}.${property}`;
          const value = transform[property];
          const keyframe: Keyframe = { id: `${clipId}-${poseId}-${trackId}-${time}`, time, value, interpolation: "bezier", curve: [0.25, 0, 0.35, 1], curvePreset: "easeInOut" };
          nextTracks[trackId] = upsertKeyframe(nextTracks[trackId] ?? [], keyframe);
        }
      }
      return {
        ...markDirty(state, clipId, "animations"),
        animations: {
          ...state.animations,
          [clipId]: {
            ...clip,
            tracks: nextTracks
          }
        },
        timeline: {
          ...state.timeline,
          selectedClipId: clipId,
          selectedKeyIds: Object.values(nextTracks).flatMap((keys) => keys.filter((key) => Math.abs(key.time - time) < 0.0001).map((key) => key.id))
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: previous } } : state)
  };
}

export function createCopyPoseCommand(poseId: string): EditorCommand {
  let previous: PoseDefinition | null = null;
  return {
    id: `copy-pose:${poseId}`,
    label: "Copy pose",
    do: (state) => {
      const pose = state.poses[poseId];
      previous = state.poseClipboard;
      return pose ? { ...state, poseClipboard: clonePose(pose) } : state;
    },
    undo: (state) => ({ ...state, poseClipboard: previous })
  };
}

export function createPastePoseCommand(nextId: string): EditorCommand {
  return {
    id: `paste-pose:${nextId}`,
    label: "Paste pose",
    do: (state) =>
      state.poseClipboard && !state.poses[nextId]
        ? { ...markDirty(state, nextId, "poses"), poses: { ...state.poses, [nextId]: { ...clonePose(state.poseClipboard), id: nextId, name: `${state.poseClipboard.name} Pasted` } } }
        : state,
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId, "poses"), poses };
    }
  };
}

export function createUpdatePoseTagsCommand(poseId: string, tags: readonly string[]): EditorCommand {
  let previous: readonly string[] | undefined;
  return {
    id: `tag-pose:${poseId}`,
    label: "Update pose tags",
    do: (state) => {
      const pose = state.poses[poseId];
      previous = pose?.tags;
      return pose ? { ...markDirty(state, poseId, "poses"), poses: { ...state.poses, [poseId]: { ...pose, tags } } } : state;
    },
    undo: (state) => {
      const pose = state.poses[poseId];
      return pose && previous ? { ...markDirty(state, poseId, "poses"), poses: { ...state.poses, [poseId]: { ...pose, tags: previous } } } : state;
    }
  };
}

export function createAddKeyframeCommand(clipId: string, trackId: string, keyframe: Keyframe): EditorCommand {
  return {
    id: `add-key:${clipId}:${trackId}:${keyframe.id}`,
    label: "Add keyframe",
    do: (state) => updateClipTrack(state, clipId, trackId, (keys) => [...keys, snapKeyframe(state, keyframe)].sort((a, b) => a.time - b.time)),
    undo: (state) => updateClipTrack(state, clipId, trackId, (keys) => keys.filter((key) => key.id !== keyframe.id))
  };
}

export function createSetKeyframeAtTimeCommand(clipId: string, trackId: string, time: number, value: JsonValue, interpolation: Keyframe["interpolation"] = "linear"): EditorCommand {
  let previous: readonly Keyframe[] | undefined;
  let hadTrack = false;
  const frameEpsilon = 0.000001;

  return {
    id: `set-key-at-time:${clipId}:${trackId}:${time}`,
    label: "Set keyframe at time",
    do: (state) => {
      const clip = state.animations[clipId];
      if (!clip) {
        return state;
      }
      hadTrack = Object.prototype.hasOwnProperty.call(clip.tracks, trackId);
      previous = clip.tracks[trackId];
      const snappedTime = snapKeyframe(state, { id: "snap", time, value, interpolation }).time;

      return updateClipTrack(state, clipId, trackId, (keys) => {
        const existing = keys.find((key) => Math.abs(key.time - snappedTime) <= frameEpsilon);
        if (existing) {
          return keys.map((key) => (key.id === existing.id ? snapKeyframe(state, { ...key, time: snappedTime, value }) : key)).sort((a, b) => a.time - b.time);
        }
        const idTime = snappedTime.toFixed(3).replace(/[^a-zA-Z0-9_-]/g, "_");
        return [...keys, { id: `${trackId}-${idTime}`, time: snappedTime, value, interpolation }].sort((a, b) => a.time - b.time);
      });
    },
    undo: (state) => {
      const clip = state.animations[clipId];
      if (!clip) {
        return state;
      }
      if (hadTrack) {
        return updateClipTrack(state, clipId, trackId, () => previous ?? []);
      }
      const { [trackId]: _removed, ...tracks } = clip.tracks;
      return { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks } } };
    }
  };
}

export function createSetFacialGazeCommand(
  facialRig: EditorFacialRig,
  clipId: string,
  time: number,
  side: "left" | "right",
  linked: boolean,
  x: number,
  y: number,
  expressionPartIds?: Partial<Record<"left" | "right", string | null>>
): EditorCommand {
  const sides: readonly ("left" | "right")[] = linked ? ["left", "right"] : [side];
  const commands = sides.flatMap((targetSide) => {
    const expressionPartId = expressionPartIds?.[targetSide];
    const bounds = expressionPartId ? facialRig.gazeBoundsByExpression?.[expressionPartId] ?? facialRig.gazeBounds : facialRig.gazeBounds;
    const clampedX = Math.min(bounds.x[1], Math.max(bounds.x[0], x));
    const clampedY = Math.min(bounds.y[1], Math.max(bounds.y[0], y));
    const boneId = facialRig.eyeAimBones[targetSide];
    const pupilCommands = [
      createSetKeyframeAtTimeCommand(clipId, `${boneId}.x`, time, clampedX, "linear"),
      createSetKeyframeAtTimeCommand(clipId, `${boneId}.y`, time, clampedY, "linear")
    ];
    const irisPartId = facialRig.irisParallaxParts?.[targetSide];
    const irisOrigin = facialRig.irisOrigins?.[targetSide];
    const irisParallax = facialRig.irisParallax ?? 0;
    return irisPartId && irisOrigin && irisParallax > 0 ? [
      ...pupilCommands,
      createSetKeyframeAtTimeCommand(clipId, `part:${irisPartId}.x`, time, irisOrigin[0] + clampedX * irisParallax, "linear"),
      createSetKeyframeAtTimeCommand(clipId, `part:${irisPartId}.y`, time, irisOrigin[1] + clampedY * irisParallax, "linear")
    ] : pupilCommands;
  });
  return createGroupedCommand(linked ? "Set linked facial gaze" : `Set ${side} facial gaze`, commands);
}

export function createReplaceKeyframeRangeCommand(
  clipId: string,
  trackId: string,
  startTime: number,
  endTime: number,
  values: readonly { readonly time: number; readonly value: JsonValue; readonly interpolation?: Keyframe["interpolation"] }[]
): EditorCommand {
  let previous: readonly Keyframe[] | undefined;
  let hadTrack = false;
  const frameEpsilon = 0.000001;

  return {
    id: `replace-key-range:${clipId}:${trackId}:${startTime}:${endTime}`,
    label: "Replace keyframe range",
    do: (state) => {
      const clip = state.animations[clipId];
      if (!clip) return state;
      hadTrack = Object.prototype.hasOwnProperty.call(clip.tracks, trackId);
      previous = clip.tracks[trackId];
      const snappedStart = snapKeyframe(state, { id: "range-start", time: startTime, value: null, interpolation: "step" }).time;
      const snappedEnd = snapKeyframe(state, { id: "range-end", time: endTime, value: null, interpolation: "step" }).time;
      const replacement = values.map((value, index) => {
        const snapped = snapKeyframe(state, { id: "range-key", time: value.time, value: value.value, interpolation: value.interpolation ?? "step" });
        return { ...snapped, id: `${trackId}-stream-${index}-${snapped.time.toFixed(3).replace(/[^a-zA-Z0-9_-]/g, "_")}` };
      });
      return updateClipTrack(state, clipId, trackId, (keys) => [
        ...keys.filter((key) => key.time < snappedStart - frameEpsilon || key.time > snappedEnd + frameEpsilon),
        ...replacement
      ].sort((a, b) => a.time - b.time));
    },
    undo: (state) => {
      const clip = state.animations[clipId];
      if (!clip) return state;
      if (hadTrack) return updateClipTrack(state, clipId, trackId, () => previous ?? []);
      const { [trackId]: _removed, ...tracks } = clip.tracks;
      return { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks } } };
    }
  };
}

export function createAddAnimationTrackCommand(clipId: string, trackId: string): EditorCommand {
  let previous: readonly Keyframe[] | undefined;
  return {
    id: `add-track:${clipId}:${trackId}`,
    label: "Add animation track",
    do(state) {
      const clip = state.animations[clipId];
      previous = clip?.tracks[trackId];
      return clip && !clip.tracks[trackId] ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks: { ...clip.tracks, [trackId]: [] } } } } : state;
    },
    undo(state) {
      const clip = state.animations[clipId];
      if (!clip) {
        return state;
      }
      if (previous) {
        return { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks: { ...clip.tracks, [trackId]: previous } } } };
      }
      const { [trackId]: _removed, ...tracks } = clip.tracks;
      return { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks } } };
    }
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
  let previous: AnimationClip | undefined;
  return {
    id: `move-key:${clipId}:${trackId}:${keyframeId}`,
    label: "Move keyframe",
    do: (state) => {
      const clip = state.animations[clipId];
      const draggedKey = clip?.tracks[trackId]?.find((key) => key.id === keyframeId);
      previous = clip;
      if (!clip || !draggedKey) {
        return state;
      }
      const selectedIds = state.timeline.selectedClipId === clipId && state.timeline.selectedKeyIds.includes(keyframeId) ? new Set(state.timeline.selectedKeyIds) : new Set([keyframeId]);
      const snappedTime = snapKeyframe(state, { ...draggedKey, time: nextTime }).time;
      const delta = snappedTime - draggedKey.time;
      return {
        ...markDirty(state, clipId, "animations"),
        animations: {
          ...state.animations,
          [clipId]: mapClipKeys(clip, (key) => (selectedIds.has(key.id) ? snapKeyframe(state, { ...key, time: Math.max(0, Math.min(clip.duration, key.time + delta)) }) : key))
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: previous } } : state)
  };
}

export function createUpdateKeyframeCommand(clipId: string, trackId: string, keyframeId: string, next: Partial<Pick<Keyframe, "time" | "value">>): EditorCommand {
  let previous: Keyframe | undefined;
  return {
    id: `update-key:${clipId}:${trackId}:${keyframeId}`,
    label: "Update keyframe",
    do: (state) =>
      updateClipTrack(state, clipId, trackId, (keys) =>
        keys
          .map((key) => {
            if (key.id !== keyframeId) {
              return key;
            }
            previous = previous ?? key;
            return snapKeyframe(state, { ...key, ...next });
          })
          .sort((a, b) => a.time - b.time)
      ),
    undo: (state) => (previous ? updateClipTrack(state, clipId, trackId, (keys) => keys.map((key) => (key.id === keyframeId ? previous! : key)).sort((a, b) => a.time - b.time)) : state)
  };
}

export function createAnimationClipCommand(clipId: string, name: string, duration = 1, loop = true): EditorCommand {
  return {
    id: `create-clip:${clipId}`,
    label: "Create animation clip",
    do: (state) =>
      state.animations[clipId]
        ? state
        : {
            ...markDirty(state, clipId, "animations"),
            animations: { ...state.animations, [clipId]: { id: clipId, name, duration, frameRate: state.timeline.snappingFps, loop, tracks: {}, events: [], markers: [], tags: [] } },
            timeline: { ...state.timeline, selectedClipId: clipId, selectedKeyIds: [] }
          },
    undo: (state) => {
      const { [clipId]: _removed, ...animations } = state.animations;
      return { ...markDirty(state, clipId, "animations"), animations, timeline: { ...state.timeline, selectedClipId: state.timeline.selectedClipId === clipId ? "idle" : state.timeline.selectedClipId } };
    }
  };
}

export function createDeleteAnimationClipCommand(clipId: string): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `delete-clip:${clipId}`,
    label: "Delete animation clip",
    do: (state) => {
      previous = state.animations[clipId];
      const { [clipId]: _removed, ...animations } = state.animations;
      return previous ? { ...markDirty(state, clipId, "animations"), animations, timeline: { ...state.timeline, selectedClipId: "idle", selectedKeyIds: [] } } : state;
    },
    undo: (state) => (previous ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: previous }, timeline: { ...state.timeline, selectedClipId: clipId } } : state)
  };
}

export function createSetTimelineSelectionCommand(clipId: string, keyIds: readonly string[]): EditorCommand {
  let previous: TimelineState | undefined;
  return {
    id: `timeline-select:${clipId}:${keyIds.join(",")}`,
    label: "Select timeline keys",
    do: (state) => {
      previous = state.timeline;
      return { ...state, timeline: { ...state.timeline, selectedClipId: clipId, selectedKeyIds: keyIds } };
    },
    undo: (state) => (previous ? { ...state, timeline: previous } : state)
  };
}

export function createSelectTrackKeysCommand(clipId: string, trackId: string): EditorCommand {
  let previous: TimelineState | undefined;
  return {
    id: `timeline-select-track:${clipId}:${trackId}`,
    label: "Select track keys",
    do: (state) => {
      previous = state.timeline;
      const keyIds = state.animations[clipId]?.tracks[trackId]?.map((key) => key.id) ?? [];
      return { ...state, timeline: { ...state.timeline, selectedClipId: clipId, selectedKeyIds: keyIds } };
    },
    undo: (state) => (previous ? { ...state, timeline: previous } : state)
  };
}

export function createDeleteSelectedKeysCommand(): EditorCommand {
  let previous: AnimationClip | undefined;
  let previousTimeline: TimelineState | undefined;
  return {
    id: "timeline-delete-selected-keys",
    label: "Delete selected keys",
    do: (state) => {
      const clip = state.animations[state.timeline.selectedClipId];
      if (!clip || !state.timeline.selectedKeyIds.length) {
        return state;
      }
      previous = clip;
      previousTimeline = state.timeline;
      const selected = new Set(state.timeline.selectedKeyIds);
      return {
        ...markDirty(state, clip.id, "animations"),
        animations: {
          ...state.animations,
          [clip.id]: {
            ...clip,
            tracks: Object.fromEntries(
              Object.entries(clip.tracks)
                .map(([trackId, keys]) => [trackId, keys.filter((key) => !selected.has(key.id))] as const)
                .filter(([, keys]) => keys.length)
            )
          }
        },
        timeline: { ...state.timeline, selectedKeyIds: [] }
      };
    },
    undo: (state) => (previous && previousTimeline ? { ...markDirty(state, previous.id, "animations"), animations: { ...state.animations, [previous.id]: previous }, timeline: previousTimeline } : state)
  };
}

export function createCopySelectedKeysCommand(): EditorCommand {
  let previous: readonly TimelineClipboardKey[] = [];
  return {
    id: "timeline-copy-keys",
    label: "Copy selected keys",
    do: (state) => {
      const clip = state.animations[state.timeline.selectedClipId];
      previous = state.timeline.keyClipboard;
      if (!clip) {
        return state;
      }
      const selected = new Set(state.timeline.selectedKeyIds);
      const keyClipboard = Object.entries(clip.tracks).flatMap(([trackId, keys]) => keys.filter((key) => selected.has(key.id)).map((key) => ({ trackId, keyframe: { ...key } })));
      return { ...state, timeline: { ...state.timeline, keyClipboard } };
    },
    undo: (state) => ({ ...state, timeline: { ...state.timeline, keyClipboard: previous } })
  };
}

export function createPasteKeysCommand(clipId: string, atTime: number): EditorCommand {
  return {
    id: `timeline-paste-keys:${clipId}:${atTime}`,
    label: "Paste keys",
    do: (state) => {
      const clip = state.animations[clipId];
      if (!clip || !state.timeline.keyClipboard.length) {
        return state;
      }
      const minTime = Math.min(...state.timeline.keyClipboard.map((item) => item.keyframe.time));
      const tracks = { ...clip.tracks };
      const pastedIds: string[] = [];
      for (const item of state.timeline.keyClipboard) {
        const keyframe = snapKeyframe(state, { ...item.keyframe, id: `${item.keyframe.id}_paste_${pastedIds.length}`, time: atTime + item.keyframe.time - minTime });
        pastedIds.push(keyframe.id);
        tracks[item.trackId] = [...(tracks[item.trackId] ?? []), keyframe].sort((a, b) => a.time - b.time);
      }
      return { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks } }, timeline: { ...state.timeline, selectedClipId: clipId, selectedKeyIds: pastedIds } };
    },
    undo: (state) => {
      const clip = state.animations[clipId];
      if (!clip) {
        return state;
      }
      const selected = new Set(state.timeline.selectedKeyIds);
      const tracks = Object.fromEntries(Object.entries(clip.tracks).map(([trackId, keys]) => [trackId, keys.filter((key) => !selected.has(key.id))]));
      return { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: { ...clip, tracks } } };
    }
  };
}

export function createScaleSelectedKeysCommand(factor: number): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `timeline-scale-keys:${factor}`,
    label: "Scale selected keys",
    do: (state) => {
      const clip = state.animations[state.timeline.selectedClipId];
      previous = clip;
      if (!clip) return state;
      const selected = new Set(state.timeline.selectedKeyIds);
      return {
        ...markDirty(state, clip.id, "animations"),
        animations: { ...state.animations, [clip.id]: { ...clip, tracks: mapClipKeys(clip, (key) => (selected.has(key.id) ? snapKeyframe(state, { ...key, time: key.time * factor }) : key)).tracks } }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, previous.id, "animations"), animations: { ...state.animations, [previous.id]: previous } } : state)
  };
}

export function createRetimeClipCommand(clipId: string, duration: number): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `retime-clip:${clipId}:${duration}`,
    label: "Retime clip",
    do: (state) => {
      const clip = state.animations[clipId];
      previous = clip;
      return clip ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: retimeClip(clip, duration) } } : state;
    },
    undo: (state) => (previous ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: previous } } : state)
  };
}

export function createReverseClipCommand(clipId: string): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `reverse-clip:${clipId}`,
    label: "Reverse clip",
    do: (state) => {
      const clip = state.animations[clipId];
      previous = clip;
      return clip ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: reverseClip(clip) } } : state;
    },
    undo: (state) => (previous ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: previous } } : state)
  };
}

export function createNormalizeLoopCommand(clipId: string): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `normalize-loop:${clipId}`,
    label: "Normalize loop",
    do: (state) => {
      const clip = state.animations[clipId];
      previous = clip;
      return clip ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: normalizeLoopClip(clip) } } : state;
    },
    undo: (state) => (previous ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: previous } } : state)
  };
}

export function createAddTimelineMarkerCommand(clipId: string, marker: TimelineMarker): EditorCommand {
  return {
    id: `timeline-marker:${clipId}:${marker.id}`,
    label: "Add timeline marker",
    do: (state) => updateClip(state, clipId, (clip) => ({ ...clip, markers: [...clip.markers.filter((item) => item.id !== marker.id), marker].sort((a, b) => a.time - b.time) })),
    undo: (state) => updateClip(state, clipId, (clip) => ({ ...clip, markers: clip.markers.filter((item) => item.id !== marker.id) }))
  };
}

export function createAddTimelineEventCommand(clipId: string, event: TimelineEvent): EditorCommand {
  return {
    id: `timeline-event:${clipId}:${event.id}`,
    label: "Add timeline event",
    do: (state) => updateClip(state, clipId, (clip) => ({ ...clip, events: [...clip.events.filter((item) => item.id !== event.id), event].sort((a, b) => a.time - b.time) })),
    undo: (state) => updateClip(state, clipId, (clip) => ({ ...clip, events: clip.events.filter((item) => item.id !== event.id) }))
  };
}

export function createUpdateTimelineEventCommand(clipId: string, eventId: string, patch: TimelineEventPatch): EditorCommand {
  let previous: TimelineEvent | undefined;
  return {
    id: `timeline-event-update:${clipId}:${eventId}`,
    label: "Update timeline event",
    do: (state) =>
      updateClip(state, clipId, (clip) => {
        previous = previous ?? clip.events.find((item) => item.id === eventId);
        return {
          ...clip,
          events: clip.events
            .map((item) => (item.id === eventId ? applyTimelineEventPatch(item, patch) : item))
            .sort((a, b) => a.time - b.time)
        };
      }),
    undo: (state) =>
      previous
        ? updateClip(state, clipId, (clip) => ({
            ...clip,
            events: [...clip.events.filter((item) => item.id !== eventId), previous!].sort((a, b) => a.time - b.time)
          }))
        : state
  };
}

function applyTimelineEventPatch(event: TimelineEvent, patch: TimelineEventPatch): TimelineEvent {
  let next: TimelineEvent = event;
  if (patch.time !== undefined) {
    next = { ...next, time: patch.time };
  }
  if (patch.type !== undefined) {
    next = { ...next, type: patch.type };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "category")) {
    const { category: _category, ...withoutCategory } = next;
    next = patch.category === undefined ? withoutCategory : { ...withoutCategory, category: patch.category };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "duration")) {
    const { duration: _duration, ...withoutDuration } = next;
    next = patch.duration === undefined ? withoutDuration : { ...withoutDuration, duration: patch.duration };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "payload")) {
    const { payload: _payload, ...withoutPayload } = next;
    next = patch.payload === undefined ? withoutPayload : { ...withoutPayload, payload: patch.payload };
  }
  return next;
}

export function createDeleteTimelineEventCommand(clipId: string, eventId: string): EditorCommand {
  let previous: TimelineEvent | undefined;
  return {
    id: `timeline-event-delete:${clipId}:${eventId}`,
    label: "Delete timeline event",
    do: (state) =>
      updateClip(state, clipId, (clip) => {
        previous = previous ?? clip.events.find((item) => item.id === eventId);
        return { ...clip, events: clip.events.filter((item) => item.id !== eventId) };
      }),
    undo: (state) =>
      previous
        ? updateClip(state, clipId, (clip) => ({ ...clip, events: [...clip.events.filter((item) => item.id !== eventId), previous!].sort((a, b) => a.time - b.time) }))
        : state
  };
}

export function createSetTimelineAutoKeyCommand(enabled: boolean): EditorCommand {
  let previous: TimelineState | undefined;
  return {
    id: `timeline-auto-key:${enabled}`,
    label: "Set timeline auto-key",
    do: (state) => {
      previous = state.timeline;
      return { ...state, timeline: { ...state.timeline, autoKey: enabled } };
    },
    undo: (state) => (previous ? { ...state, timeline: previous } : state)
  };
}

export function createChangeCurveCommand(
  clipId: string,
  trackId: string,
  keyframeId: string,
  interpolation: Keyframe["interpolation"],
  curve: readonly [number, number, number, number],
  preset: CurvePreset = "cubicBezier"
): EditorCommand {
  let previous: Keyframe | undefined;
  const change = (state: EditorProjectState, next: { interpolation: Keyframe["interpolation"]; curve: readonly [number, number, number, number]; preset: CurvePreset }) =>
    updateClipTrack(state, clipId, trackId, (keys) =>
      keys.map((key) => {
        if (key.id !== keyframeId) {
          return key;
        }
        previous = previous ?? key;
        return { ...key, interpolation: next.interpolation, curve: next.curve, curvePreset: next.preset };
      })
    );
  return {
    id: `curve:${clipId}:${trackId}:${keyframeId}`,
    label: "Change curve",
    do: (state) => change(state, { interpolation, curve, preset }),
    undo: (state) => (previous ? updateClipTrack(state, clipId, trackId, (keys) => keys.map((key) => (key.id === keyframeId ? previous! : key))) : state)
  };
}

export function createApplyCurvePresetCommand(clipId: string, trackId: string, keyframeId: string, preset: CurvePreset): EditorCommand {
  const curve = curvePresetToKeyframe(preset);
  return createChangeCurveCommand(clipId, trackId, keyframeId, curve.interpolation, curve.curve, preset);
}

export function createApplyCurvePresetToSelectionCommand(preset: CurvePreset): EditorCommand {
  let previous: AnimationClip | undefined;
  return {
    id: `curve-selection:${preset}`,
    label: "Apply curve preset to selection",
    do: (state) => {
      const clip = state.animations[state.timeline.selectedClipId];
      if (!clip || !state.timeline.selectedKeyIds.length) {
        return state;
      }
      previous = clip;
      const selected = new Set(state.timeline.selectedKeyIds);
      const next = curvePresetToKeyframe(preset);
      return {
        ...markDirty(state, clip.id, "animations"),
        animations: {
          ...state.animations,
          [clip.id]: {
            ...clip,
            tracks: mapClipKeys(clip, (key) => (selected.has(key.id) ? { ...key, interpolation: next.interpolation, curve: next.curve, curvePreset: preset } : key)).tracks
          }
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, previous.id, "animations"), animations: { ...state.animations, [previous.id]: previous } } : state)
  };
}

export function createEditBezierHandlesCommand(clipId: string, trackId: string, keyframeId: string, curve: readonly [number, number, number, number]): EditorCommand {
  return createChangeCurveCommand(clipId, trackId, keyframeId, "bezier", curve, "custom");
}

export function createSetKeyframeTangentsCommand(clipId: string, trackId: string, keyframeId: string, tangentIn: number, tangentOut: number): EditorCommand {
  let previous: Keyframe | undefined;
  return {
    id: `tangents:${clipId}:${trackId}:${keyframeId}`,
    label: "Set keyframe tangents",
    do: (state) =>
      updateClipTrack(state, clipId, trackId, (keys) =>
        keys.map((key) => {
          if (key.id !== keyframeId) {
            return key;
          }
          previous = key;
          return { ...key, tangentIn, tangentOut, curvePreset: "custom" };
        })
      ),
    undo: (state) => (previous ? updateClipTrack(state, clipId, trackId, (keys) => keys.map((key) => (key.id === keyframeId ? previous! : key))) : state)
  };
}

export function createSetCurvePreviewCommand(fromClipId: string, toClipId: string, weight: number): EditorCommand {
  let previous: TimelineState["curvePreview"] | undefined;
  return {
    id: `curve-preview:${fromClipId}:${toClipId}:${weight}`,
    label: "Set curve preview",
    do: (state) => {
      previous = state.timeline.curvePreview;
      return { ...markDirty(state, "curvePreview", "preview"), timeline: { ...state.timeline, curvePreview: { fromClipId, toClipId, weight: Math.max(0, Math.min(1, weight)) } } };
    },
    undo: (state) => (previous ? { ...markDirty(state, "curvePreview", "preview"), timeline: { ...state.timeline, curvePreview: previous } } : state)
  };
}

export function createRenameAnimationCommand(clipId: string, nextId: string): EditorCommand {
  return {
    id: `rename-animation:${clipId}:${nextId}`,
    label: "Rename animation",
    do: (state) => renameAnimation(state, clipId, nextId),
    undo: (state) => renameAnimation(state, nextId, clipId)
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

export function createStateMachineStateCommand(stateNode: EditorStateNode): EditorCommand {
  return {
    id: `state:${stateNode.id}`,
    label: "Create state",
    do: (state) => ({
      ...markDirty(state, stateNode.id, "stateMachine"),
      stateMachine: { ...state.stateMachine, states: state.stateMachine.states.some((item) => item.id === stateNode.id) ? state.stateMachine.states : [...state.stateMachine.states, stateNode] }
    }),
    undo: (state) => ({ ...markDirty(state, stateNode.id, "stateMachine"), stateMachine: { ...state.stateMachine, states: state.stateMachine.states.filter((item) => item.id !== stateNode.id) } })
  };
}

export function createUpdateStateMachineStateCommand(stateId: string, patch: Partial<Omit<EditorStateNode, "id">>): EditorCommand {
  let previous: EditorStateNode | undefined;
  return {
    id: `state-update:${stateId}`,
    label: "Update state",
    do: (state) => {
      previous = state.stateMachine.states.find((item) => item.id === stateId);
      return {
        ...markDirty(state, stateId, "stateMachine"),
        stateMachine: { ...state.stateMachine, states: state.stateMachine.states.map((item) => (item.id === stateId ? { ...item, ...patch } : item)) }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, stateId, "stateMachine"), stateMachine: { ...state.stateMachine, states: state.stateMachine.states.map((item) => (item.id === stateId ? previous! : item)) } } : state)
  };
}

export function createRenameStateMachineStateCommand(stateId: string, nextId: string): EditorCommand {
  const rename = (state: EditorProjectState, from: string, to: string) => {
    if (from === to || state.stateMachine.states.some((item) => item.id === to)) {
      return state;
    }
    return {
      ...markDirty(state, to, "stateMachine"),
      stateMachine: {
        ...state.stateMachine,
        initialStateId: state.stateMachine.initialStateId === from ? to : state.stateMachine.initialStateId,
        states: state.stateMachine.states.map((item) => (item.id === from ? { ...item, id: to } : item)),
        transitions: state.stateMachine.transitions.map((transition) => ({
          ...transition,
          fromStateId: transition.fromStateId === from ? to : transition.fromStateId,
          toStateId: transition.toStateId === from ? to : transition.toStateId
        })),
        preview: {
          fromStateId: state.stateMachine.preview.fromStateId === from ? to : state.stateMachine.preview.fromStateId,
          toStateId: state.stateMachine.preview.toStateId === from ? to : state.stateMachine.preview.toStateId,
          weight: state.stateMachine.preview.weight
        }
      }
    };
  };
  return {
    id: `state-rename:${stateId}:${nextId}`,
    label: "Rename state",
    do: (state) => rename(state, stateId, nextId),
    undo: (state) => rename(state, nextId, stateId)
  };
}

export function createSetInitialStateCommand(stateId: string): EditorCommand {
  let previous: string | undefined;
  return {
    id: `state-initial:${stateId}`,
    label: "Set initial state",
    do: (state) => {
      previous = state.stateMachine.initialStateId;
      return { ...markDirty(state, stateId, "stateMachine"), stateMachine: { ...state.stateMachine, initialStateId: stateId } };
    },
    undo: (state) => (previous ? { ...markDirty(state, previous, "stateMachine"), stateMachine: { ...state.stateMachine, initialStateId: previous } } : state)
  };
}

export function createMoveStateMachineNodeCommand(stateId: string, position: StateMachineNodePosition): EditorCommand {
  let previous: StateMachineNodePosition | undefined;
  return {
    id: `state-node-position:${stateId}`,
    label: "Move state node",
    do: (state) => {
      previous = state.stateMachine.nodePositions?.[stateId];
      return {
        ...markDirty(state, stateId, "stateMachine"),
        stateMachine: {
          ...state.stateMachine,
          nodePositions: {
            ...(state.stateMachine.nodePositions ?? {}),
            [stateId]: { x: Number(position.x.toFixed(2)), y: Number(position.y.toFixed(2)) }
          }
        }
      };
    },
    undo: (state) => {
      const nodePositions = { ...(state.stateMachine.nodePositions ?? {}) };
      if (previous) {
        nodePositions[stateId] = previous;
      } else {
        delete nodePositions[stateId];
      }
      return { ...markDirty(state, stateId, "stateMachine"), stateMachine: { ...state.stateMachine, nodePositions } };
    }
  };
}

export function createUpdateTransitionCommand(transitionId: string, patch: Partial<EditorTransition>): EditorCommand {
  let previous: EditorTransition | undefined;
  return {
    id: `transition-update:${transitionId}`,
    label: "Update transition",
    do: (state) => {
      previous = state.stateMachine.transitions.find((transition) => transition.id === transitionId);
      return {
        ...markDirty(state, transitionId, "stateMachine"),
        stateMachine: { ...state.stateMachine, transitions: state.stateMachine.transitions.map((transition) => (transition.id === transitionId ? { ...transition, ...patch } : transition)) }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, transitionId, "stateMachine"), stateMachine: { ...state.stateMachine, transitions: state.stateMachine.transitions.map((transition) => (transition.id === transitionId ? previous! : transition)) } } : state)
  };
}

export function createDeleteTransitionCommand(transitionId: string): EditorCommand {
  let previous: EditorTransition | undefined;
  return {
    id: `transition-delete:${transitionId}`,
    label: "Delete transition",
    do: (state) => {
      previous = state.stateMachine.transitions.find((transition) => transition.id === transitionId);
      return {
        ...markDirty(state, transitionId, "stateMachine"),
        stateMachine: { ...state.stateMachine, transitions: state.stateMachine.transitions.filter((transition) => transition.id !== transitionId) }
      };
    },
    undo: (state) =>
      previous
        ? { ...markDirty(state, transitionId, "stateMachine"), stateMachine: { ...state.stateMachine, transitions: [...state.stateMachine.transitions, previous] } }
        : state
  };
}

export function createDeleteStateMachineStateCommand(stateId: string): EditorCommand {
  let previous: EditorStateMachine | undefined;
  return {
    id: `state-delete:${stateId}`,
    label: "Delete state",
    do: (state) => {
      const target = state.stateMachine.states.find((item) => item.id === stateId);
      if (!target || state.stateMachine.states.length <= 1) {
        return state;
      }
      previous = state.stateMachine;
      const states = state.stateMachine.states.filter((item) => item.id !== stateId);
      const fallbackId = states[0]?.id ?? state.stateMachine.initialStateId;
      const nodePositions = { ...(state.stateMachine.nodePositions ?? {}) };
      delete nodePositions[stateId];
      return {
        ...markDirty(state, stateId, "stateMachine"),
        stateMachine: {
          ...state.stateMachine,
          initialStateId: state.stateMachine.initialStateId === stateId ? fallbackId : state.stateMachine.initialStateId,
          states,
          transitions: state.stateMachine.transitions.filter((transition) => transition.fromStateId !== stateId && transition.toStateId !== stateId),
          nodePositions,
          preview: {
            fromStateId: state.stateMachine.preview.fromStateId === stateId ? fallbackId : state.stateMachine.preview.fromStateId,
            toStateId: state.stateMachine.preview.toStateId === stateId ? fallbackId : state.stateMachine.preview.toStateId,
            weight: state.stateMachine.preview.weight
          }
        }
      };
    },
    undo: (state) => (previous ? { ...markDirty(state, stateId, "stateMachine"), stateMachine: previous } : state)
  };
}

export function createSetTransitionConditionsCommand(transitionId: string, conditions: readonly EditorTransitionCondition[]): EditorCommand {
  return createUpdateTransitionCommand(transitionId, { conditions });
}

export function createSetStateMachineParameterCommand(parameter: string, value: number | boolean | string): EditorCommand {
  let previous: number | boolean | string | undefined;
  return {
    id: `state-param:${parameter}`,
    label: "Set state machine parameter",
    do: (state) => {
      previous = state.stateMachine.parameters[parameter];
      return { ...markDirty(state, parameter, "stateMachine"), stateMachine: { ...state.stateMachine, parameters: { ...state.stateMachine.parameters, [parameter]: value } } };
    },
    undo: (state) => {
      const parameters = { ...state.stateMachine.parameters };
      if (previous === undefined) {
        delete parameters[parameter];
      } else {
        parameters[parameter] = previous;
      }
      return { ...markDirty(state, parameter, "stateMachine"), stateMachine: { ...state.stateMachine, parameters } };
    }
  };
}

export function createSetBlendTreeCommand(stateId: string, blendTree: BlendTree1D): EditorCommand {
  let previous: EditorStateNode | undefined;
  return {
    id: `blend-tree:${stateId}`,
    label: "Set blend tree",
    do: (state) => {
      previous = state.stateMachine.states.find((item) => item.id === stateId);
      const normalized = normalizeBlendTreeForProject(state, blendTree);
      if (!previous || !normalized) {
        return state;
      }
      return { ...markDirty(state, stateId, "stateMachine"), stateMachine: { ...state.stateMachine, states: state.stateMachine.states.map((item) => (item.id === stateId ? { ...item, blendTree: normalized } : item)) } };
    },
    undo: (state) => (previous ? { ...markDirty(state, stateId, "stateMachine"), stateMachine: { ...state.stateMachine, states: state.stateMachine.states.map((item) => (item.id === stateId ? previous! : item)) } } : state)
  };
}

export function createSetStateMachinePreviewCommand(fromStateId: string, toStateId: string, weight: number): EditorCommand {
  let previous: EditorStateMachine["preview"] | undefined;
  return {
    id: `state-preview:${fromStateId}:${toStateId}:${weight}`,
    label: "Set state machine preview",
    do: (state) => {
      previous = state.stateMachine.preview;
      return { ...markDirty(state, "stateMachinePreview", "preview"), stateMachine: { ...state.stateMachine, preview: { fromStateId, toStateId, weight: Math.max(0, Math.min(1, weight)) } } };
    },
    undo: (state) => (previous ? { ...markDirty(state, "stateMachinePreview", "preview"), stateMachine: { ...state.stateMachine, preview: previous } } : state)
  };
}

export function evaluateStateMachinePreview(stateMachine: EditorStateMachine): StateMachineSimulation {
  const preview = stateMachine.preview;
  const activeStateId = preview.weight >= 1 ? preview.toStateId : preview.fromStateId;
  const candidate = [...stateMachine.transitions]
    .filter((transition) => transition.fromStateId === activeStateId && transition.conditions.every((condition) => isTransitionConditionMet(stateMachine.parameters[condition.parameter], condition)))
    .sort((left, right) => right.priority - left.priority)[0];
  const transition = candidate ?? stateMachine.transitions.find((item) => item.fromStateId === preview.fromStateId && item.toStateId === preview.toStateId);
  const toStateId = candidate?.toStateId ?? preview.toStateId;
  const toState = stateMachine.states.find((state) => state.id === toStateId);
  return {
    activeStateId: toStateId,
    previousStateId: activeStateId,
    ...(transition ? { transitionId: transition.id } : {}),
    transitionWeight: candidate ? 1 : preview.weight,
    blendWeights: toState?.blendTree ? evaluateBlendTree(toState.blendTree, stateMachine.parameters[toState.blendTree.parameter]) : toState?.clipId ? [{ clipId: toState.clipId, weight: 1 }] : []
  };
}

export function createUpdateProceduralCommand(next: Partial<ProceduralPresetState>): EditorCommand {
  let previous: ProceduralPresetState | undefined;
  return {
    id: "procedural:update",
    label: "Update procedural preset",
    do: (state) => {
      previous = state.procedural;
      const affectedBoneTransforms = next.breathing?.affectedBoneTransforms ?? state.procedural.breathing.affectedBoneTransforms;
      return {
        ...markDirty(state, "procedural"),
        procedural: {
          inputs: { ...state.procedural.inputs, ...next.inputs },
          breathing: { ...state.procedural.breathing, ...next.breathing, affectedBoneTransforms, affectedBones: Object.keys(affectedBoneTransforms) },
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

function captureUiSnapshot(project: EditorProjectState): EditorUiSnapshot {
  const selectedTransitionId = project.stateMachine.transitions.find(
    (transition) => transition.fromStateId === project.stateMachine.preview.fromStateId && transition.toStateId === project.stateMachine.preview.toStateId
  )?.id;
  return {
    selectedBoneId: project.selectedBoneId,
    selectedClipId: project.timeline.selectedClipId,
    selectedKeyIds: [...project.timeline.selectedKeyIds],
    curvePreview: { ...project.timeline.curvePreview },
    ...(selectedTransitionId ? { selectedTransitionId } : {}),
    stateMachinePreview: { ...project.stateMachine.preview }
  };
}

function restoreUiSnapshot(state: EditorProjectState, snapshot: EditorUiSnapshot): EditorProjectState {
  const selectedBoneId = state.bones[snapshot.selectedBoneId] ? snapshot.selectedBoneId : state.hierarchy[0] ?? "root";
  const selectedClipId = state.animations[snapshot.selectedClipId] ? snapshot.selectedClipId : state.timeline.selectedClipId;
  const selectedKeyIds = snapshot.selectedKeyIds.filter((keyId) => Object.values(state.animations[selectedClipId]?.tracks ?? {}).some((keys) => keys.some((key) => key.id === keyId)));
  const curvePreview = state.animations[snapshot.curvePreview.fromClipId] && state.animations[snapshot.curvePreview.toClipId] ? snapshot.curvePreview : state.timeline.curvePreview;
  const stateMachinePreview =
    state.stateMachine.states.some((item) => item.id === snapshot.stateMachinePreview.fromStateId) && state.stateMachine.states.some((item) => item.id === snapshot.stateMachinePreview.toStateId)
      ? snapshot.stateMachinePreview
      : state.stateMachine.preview;
  return {
    ...state,
    selectedBoneId,
    timeline: {
      ...state.timeline,
      selectedClipId,
      selectedKeyIds,
      curvePreview
    },
    stateMachine: {
      ...state.stateMachine,
      preview: stateMachinePreview
    }
  };
}

function markDirty(state: EditorProjectState, id: string, scope: DirtyScopeName = inferDirtyScope(state, id)): EditorProjectState {
  const nextDirtyScopes = {
    ...state.dirtyScopes,
    [scope]: state.dirtyScopes[scope].includes(id) ? state.dirtyScopes[scope] : [...state.dirtyScopes[scope], id]
  };
  const now = Date.now();
  return {
    ...state,
    dirty: true,
    dirtyParts: state.dirtyParts.includes(id) ? state.dirtyParts : [...state.dirtyParts, id],
    dirtyScopes: nextDirtyScopes,
    autosave: {
      ...state.autosave,
      status: "pending",
      revision: state.autosave.revision + 1,
      lastChangedAt: now,
      nextSaveAt: now + state.autosave.throttleMs
    }
  };
}

function inferDirtyScope(state: EditorProjectState, id: string): DirtyScopeName {
  if (state.bones[id] || state.parents[id] !== undefined) {
    return "bones";
  }
  if (state.parts[id]) {
    return "parts";
  }
  if (state.animations[id]) {
    return "animations";
  }
  if (state.poses[id]) {
    return "poses";
  }
  if (id === "procedural") {
    return "procedural";
  }
  if (state.stateMachine.states.some((stateItem) => stateItem.id === id) || state.stateMachine.transitions.some((transition) => transition.id === id)) {
    return "stateMachine";
  }
  return "project";
}

function removeBone(state: EditorProjectState, boneId: string, fallbackSelection: string | null): EditorProjectState {
  const fallbackBoneId = fallbackSelection && state.bones[fallbackSelection] ? fallbackSelection : "root";
  const affectedPartIds = Object.values(state.parts).filter((part) => part.boneId === boneId).map((part) => part.id);
  const affectedClipIds = Object.values(state.animations)
    .filter((clip) => Object.keys(clip.tracks).some((trackId) => trackId.startsWith(`${boneId}.`)))
    .map((clip) => clip.id);
  const affectedPoseIds = Object.values(state.poses)
    .filter((pose) => pose.boneTransforms[boneId])
    .map((pose) => pose.id);
  const { [boneId]: _removedBone, ...bones } = state.bones;
  const { [boneId]: _removedParent, ...parents } = state.parents;
  const { [boneId]: _removedMetadata, ...boneMetadata } = state.boneMetadata;
  const { [boneId]: _removedLength, ...boneLengths } = state.boneLengths;
  let dirtyState = markDirty(state, boneId, "bones");
  for (const partId of affectedPartIds) {
    dirtyState = markDirty(dirtyState, partId, "parts");
  }
  for (const clipId of affectedClipIds) {
    dirtyState = markDirty(dirtyState, clipId, "animations");
  }
  for (const poseId of affectedPoseIds) {
    dirtyState = markDirty(dirtyState, poseId, "poses");
  }
  if (state.procedural.breathing.affectedBoneTransforms[boneId] || state.procedural.secondaryMotion.target === boneId || state.procedural.squashStretch.targetBone === boneId || state.procedural.footIk.feet.includes(boneId)) {
    dirtyState = markDirty(dirtyState, "procedural", "procedural");
  }
  return {
    ...dirtyState,
    selectedBoneId: fallbackBoneId,
    hierarchy: state.hierarchy.filter((item) => item !== boneId),
    parents: Object.fromEntries(Object.entries(parents).map(([childId, parentId]) => [childId, parentId === boneId ? fallbackBoneId : parentId])),
    bones,
    boneMetadata,
    boneLengths,
    topology: removeTopologyBone(state.topology, boneId),
    parts: Object.fromEntries(Object.entries(state.parts).map(([partId, part]) => [partId, part.boneId === boneId ? { ...part, boneId: fallbackBoneId } : part])),
    visualSlots: Object.fromEntries(Object.entries(state.visualSlots).map(([slotId, slot]) => [slotId, slot.boneId === boneId ? { ...slot, boneId: fallbackBoneId } : slot])),
    ikChains: Object.fromEntries(Object.entries(state.ikChains).filter(([, chain]) => chain.rootBoneId !== boneId && chain.middleBoneId !== boneId && chain.endBoneId !== boneId)),
    animations: Object.fromEntries(
      Object.entries(state.animations).map(([clipId, clip]) => [
        clipId,
        {
          ...clip,
          tracks: Object.fromEntries(Object.entries(clip.tracks).filter(([trackId]) => !trackId.startsWith(`${boneId}.`)))
        }
      ])
    ),
    poses: Object.fromEntries(
      Object.entries(state.poses).map(([poseId, pose]) => {
        const { [boneId]: _removedPoseTransform, ...boneTransforms } = pose.boneTransforms;
        return [poseId, { ...pose, boneTransforms }];
      })
    ),
    procedural: renameProceduralBoneRefs(state.procedural, boneId, fallbackBoneId)
  };
}

function renameBone(state: EditorProjectState, boneId: string, nextId: string): EditorProjectState {
  const current = state.bones[boneId];
  if (!current || state.bones[nextId]) {
    return state;
  }
  const { [boneId]: _removedBone, ...bones } = state.bones;
  const { [boneId]: parent, ...parents } = state.parents;
  const { [boneId]: metadata, ...boneMetadata } = state.boneMetadata;
  const { [boneId]: length, ...boneLengths } = state.boneLengths;
  const dirtyState = renameDirtyRefs(markDirty(state, nextId, "bones"), boneId, nextId);
  return {
    ...dirtyState,
    selectedBoneId: state.selectedBoneId === boneId ? nextId : state.selectedBoneId,
    hierarchy: state.hierarchy.map((item) => (item === boneId ? nextId : item)),
    parents: Object.fromEntries(Object.entries({ ...parents, [nextId]: parent ?? null }).map(([child, value]) => [child, value === boneId ? nextId : value])),
    bones: { ...bones, [nextId]: current },
    boneMetadata: metadata ? { ...boneMetadata, [nextId]: metadata } : boneMetadata,
    boneLengths: { ...boneLengths, [nextId]: length ?? 0 },
    topology: renameTopologyBone(state.topology, boneId, nextId),
    parts: Object.fromEntries(Object.entries(state.parts).map(([partId, part]) => [partId, part.boneId === boneId ? { ...part, boneId: nextId } : part])),
    visualSlots: Object.fromEntries(Object.entries(state.visualSlots).map(([slotId, slot]) => [slotId, slot.boneId === boneId ? { ...slot, boneId: nextId } : slot])),
    ikChains: Object.fromEntries(
      Object.entries(state.ikChains).map(([chainId, chain]) => [chainId, {
        ...chain,
        rootBoneId: chain.rootBoneId === boneId ? nextId : chain.rootBoneId,
        middleBoneId: chain.middleBoneId === boneId ? nextId : chain.middleBoneId,
        endBoneId: chain.endBoneId === boneId ? nextId : chain.endBoneId
      }])
    ),
    animations: Object.fromEntries(
      Object.entries(state.animations).map(([clipId, clip]) => [
        clipId,
        {
          ...clip,
          tracks: Object.fromEntries(Object.entries(clip.tracks).map(([trackId, keys]) => [trackId.startsWith(`${boneId}.`) ? `${nextId}${trackId.slice(boneId.length)}` : trackId, keys]))
        }
      ])
    ),
    poses: Object.fromEntries(
      Object.entries(state.poses).map(([poseId, pose]) => [
        poseId,
        {
          ...pose,
          boneTransforms: Object.fromEntries(Object.entries(pose.boneTransforms).map(([poseBoneId, transform]) => [poseBoneId === boneId ? nextId : poseBoneId, transform]))
        }
      ])
    ),
    procedural: renameProceduralBoneRefs(state.procedural, boneId, nextId)
  };
}

function renameDirtyRefs(state: EditorProjectState, boneId: string, nextId: string): EditorProjectState {
  const renameIds = (ids: readonly string[]) => Array.from(new Set(ids.map((id) => (id === boneId ? nextId : id))));
  return {
    ...state,
    dirtyParts: renameIds(state.dirtyParts),
    dirtyScopes: {
      project: renameIds(state.dirtyScopes.project),
      bones: renameIds(state.dirtyScopes.bones),
      parts: renameIds(state.dirtyScopes.parts),
      animations: renameIds(state.dirtyScopes.animations),
      poses: renameIds(state.dirtyScopes.poses),
      stateMachine: renameIds(state.dirtyScopes.stateMachine),
      procedural: renameIds(state.dirtyScopes.procedural),
      preview: renameIds(state.dirtyScopes.preview)
    }
  };
}

function mergeBoneMetadata(previous: BoneMetadata | undefined, patch: BoneMetadataPatch): BoneMetadata {
  const next: Record<string, unknown> = { ...(previous ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as BoneMetadata;
}

function mirrorTransform(transform: BoneTransform): BoneTransform {
  return {
    ...transform,
    x: -transform.x,
    rotation: -transform.rotation
  };
}

function getDescendantBoneIds(state: EditorProjectState, boneId: string): readonly string[] {
  const descendants: string[] = [];
  const visit = (parentId: string) => {
    for (const childId of state.hierarchy) {
      if (state.parents[childId] === parentId) {
        descendants.push(childId);
        visit(childId);
      }
    }
  };
  visit(boneId);
  return descendants;
}

function renameProceduralBoneRefs(procedural: ProceduralPresetState, boneId: string, nextId: string): ProceduralPresetState {
  const rename = (value: string) => (value === boneId ? nextId : value);
  return {
    ...procedural,
    breathing: {
      ...procedural.breathing,
      affectedBones: Object.keys(procedural.breathing.affectedBoneTransforms).map(rename),
      affectedBoneTransforms: Object.fromEntries(Object.entries(procedural.breathing.affectedBoneTransforms).map(([id, transform]) => [rename(id), transform]))
    },
    secondaryMotion: { ...procedural.secondaryMotion, target: rename(procedural.secondaryMotion.target) },
    squashStretch: { ...procedural.squashStretch, targetBone: rename(procedural.squashStretch.targetBone) },
    footIk: {
      ...procedural.footIk,
      feet: procedural.footIk.feet.map(rename),
      footChains: procedural.footIk.footChains.map((chain) => ({
        ...chain,
        footBone: rename(chain.footBone),
        ...(chain.shinBone ? { shinBone: rename(chain.shinBone) } : {}),
        ...(chain.thighBone ? { thighBone: rename(chain.thighBone) } : {})
      }))
    }
  };
}

function applyPoseParts(parts: EditorProjectState["parts"], pose: PoseDefinition): EditorProjectState["parts"] {
  const nextParts = { ...parts };
  for (const [partId, points] of Object.entries(pose.deforms ?? {})) {
    const part = nextParts[partId];
    if (part) {
      nextParts[partId] = withPointPath(part, points);
    }
  }
  for (const [partId, props] of Object.entries(pose.partProperties ?? {})) {
    const part = nextParts[partId];
    if (part) {
      nextParts[partId] = props.drawOrder !== undefined ? { ...part, zIndex: props.drawOrder } : part;
    }
  }
  return nextParts;
}

function clonePose(pose: PoseDefinition): PoseDefinition {
  return {
    ...pose,
    boneTransforms: Object.fromEntries(Object.entries(pose.boneTransforms).map(([boneId, transform]) => [boneId, { ...transform }])),
    ...(pose.deforms ? { deforms: Object.fromEntries(Object.entries(pose.deforms).map(([partId, points]) => [partId, points.map((point) => [point[0], point[1]] as const)])) } : {}),
    ...(pose.partProperties ? { partProperties: Object.fromEntries(Object.entries(pose.partProperties).map(([partId, props]) => [partId, { ...props }])) } : {}),
    tags: [...pose.tags]
  };
}

function blendTransform(from: BoneTransform, to: BoneTransform, weight: number): BoneTransform {
  const mix = (a: number, b: number) => Number((a + (b - a) * weight).toFixed(4));
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    rotation: mix(from.rotation, to.rotation),
    scaleX: mix(from.scaleX, to.scaleX),
    scaleY: mix(from.scaleY, to.scaleY)
  };
}

function mirrorBoneId(boneId: string): string {
  if (boneId.includes("Front")) {
    return boneId.replace("Front", "Back");
  }
  if (boneId.includes("Back")) {
    return boneId.replace("Back", "Front");
  }
  return boneId;
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

function upsertKeyframe(keys: readonly Keyframe[], keyframe: Keyframe): readonly Keyframe[] {
  const nextKeys = keys.filter((key) => Math.abs(key.time - keyframe.time) > 0.0001);
  return [...nextKeys, keyframe].sort((a, b) => a.time - b.time);
}

function updateClip(state: EditorProjectState, clipId: string, updater: (clip: AnimationClip) => AnimationClip): EditorProjectState {
  const clip = state.animations[clipId];
  return clip ? { ...markDirty(state, clipId, "animations"), animations: { ...state.animations, [clipId]: updater(clip) } } : state;
}

function snapKeyframe(state: EditorProjectState, keyframe: Keyframe): Keyframe {
  const frame = 1 / Math.max(1, state.timeline.snappingFps);
  return { ...keyframe, time: Math.round(keyframe.time / frame) * frame };
}

function mapClipKeys(clip: AnimationClip, mapper: (key: Keyframe, trackId: string) => Keyframe): AnimationClip {
  return {
    ...clip,
    tracks: Object.fromEntries(Object.entries(clip.tracks).map(([trackId, keys]) => [trackId, keys.map((key) => mapper(key, trackId)).sort((a, b) => a.time - b.time)]))
  };
}

function pointsToSchemaPath(points: readonly (readonly [number, number])[]): readonly PathCommand[] {
  return points.map(([x, y], index) => ({ type: index === 0 ? "M" : "L", x, y }));
}

function pathCommandsToPoints(commands: readonly PathCommand[]): readonly (readonly [number, number])[] {
  return commands.flatMap((command) => ("x" in command && "y" in command ? [[command.x, command.y] as const] : []));
}

function toVectorPathCommands(commands: readonly PathCommand[]): readonly VectorPathCommand[] {
  return commands.map((command) => {
    if (command.type === "M" || command.type === "L") {
      return { cmd: command.type, x: command.x, y: command.y };
    }
    if (command.type === "Q") {
      return { cmd: "Q", cpx: command.cx, cpy: command.cy, x: command.x, y: command.y };
    }
    if (command.type === "C") {
      return { cmd: "C", cp1x: command.c1x, cp1y: command.c1y, cp2x: command.c2x, cp2y: command.c2y, x: command.x, y: command.y };
    }
    return { cmd: "Z" };
  });
}

function toSchemaPathCommand(command: VectorPathCommand): PathCommand {
  if (command.cmd === "M" || command.cmd === "L") {
    return { type: command.cmd, x: command.x, y: command.y };
  }
  if (command.cmd === "Q") {
    return { type: "Q", cx: command.cpx, cy: command.cpy, x: command.x, y: command.y };
  }
  if (command.cmd === "C") {
    return { type: "C", c1x: command.cp1x, c1y: command.cp1y, c2x: command.cp2x, c2y: command.cp2y, x: command.x, y: command.y };
  }
  return { type: "Z" };
}

function retimeClip(clip: AnimationClip, duration: number): AnimationClip {
  const nextDuration = Math.max(1 / clip.frameRate, duration);
  const factor = nextDuration / Math.max(1 / clip.frameRate, clip.duration);
  return {
    ...mapClipKeys(clip, (key) => ({ ...key, time: key.time * factor })),
    duration: nextDuration,
    events: clip.events.map((event) => ({ ...event, time: event.time * factor })),
    markers: clip.markers.map((marker) => ({ ...marker, time: marker.time * factor }))
  };
}

function reverseClip(clip: AnimationClip): AnimationClip {
  return {
    ...mapClipKeys(clip, (key) => ({ ...key, time: Math.max(0, clip.duration - key.time) })),
    events: clip.events.map((event) => ({ ...event, time: Math.max(0, clip.duration - event.time) })).sort((a, b) => a.time - b.time),
    markers: clip.markers.map((marker) => ({ ...marker, time: Math.max(0, clip.duration - marker.time) })).sort((a, b) => a.time - b.time)
  };
}

function normalizeLoopClip(clip: AnimationClip): AnimationClip {
  if (!clip.loop) {
    return clip;
  }
  const tracks = Object.fromEntries(
    Object.entries(clip.tracks).map(([trackId, keys]) => {
      const first = keys[0];
      const hasEnd = keys.some((key) => Math.abs(key.time - clip.duration) < 0.0001);
      return [trackId, first && !hasEnd ? [...keys, { ...first, id: `${first.id}_loop`, time: clip.duration }].sort((a, b) => a.time - b.time) : keys];
    })
  );
  return { ...clip, tracks, markers: clip.markers.some((marker) => marker.time === clip.duration) ? clip.markers : [...clip.markers, { id: `${clip.id}-loop`, time: clip.duration, label: "Loop", color: "#4f8cff" }] };
}

function curvePresetToKeyframe(preset: CurvePreset): { readonly interpolation: Keyframe["interpolation"]; readonly curve: readonly [number, number, number, number] } {
  switch (preset) {
    case "linear":
      return { interpolation: "linear", curve: [0, 0, 1, 1] };
    case "step":
    case "stepped":
      return { interpolation: "step", curve: [0, 0, 1, 1] };
    case "hold":
      return { interpolation: "hold", curve: [0, 0, 1, 1] };
    case "bezier":
    case "easeIn":
      if (preset === "bezier") {
        return { interpolation: "bezier", curve: [0.2, 0.8, 0.2, 1] };
      }
      return { interpolation: "bezier", curve: [0.42, 0, 1, 1] };
    case "easeOut":
      return { interpolation: "bezier", curve: [0, 0, 0.58, 1] };
    case "easeInOut":
      return { interpolation: "bezier", curve: [0.42, 0, 0.58, 1] };
    case "spring":
      return { interpolation: "spring", curve: [0.25, 1.35, 0.35, 1] };
    case "overshoot":
      return { interpolation: "bezier", curve: [0.2, 1.35, 0.35, 1] };
    case "anticipation":
      return { interpolation: "bezier", curve: [0.35, -0.35, 0.65, 1] };
    case "custom":
    case "cubicBezier":
    default:
      return { interpolation: "bezier", curve: [0.2, 0.8, 0.2, 1] };
  }
}

function isTransitionConditionMet(actual: number | boolean | string | undefined, condition: EditorTransitionCondition): boolean {
  if (actual === undefined) {
    return false;
  }
  switch (condition.op) {
    case "==":
      return actual === condition.value;
    case "!=":
      return actual !== condition.value;
    case ">":
      return Number(actual) > Number(condition.value);
    case ">=":
      return Number(actual) >= Number(condition.value);
    case "<":
      return Number(actual) < Number(condition.value);
    case "<=":
      return Number(actual) <= Number(condition.value);
    default:
      return false;
  }
}

function evaluateBlendTree(blendTree: BlendTree1D, parameterValue: number | boolean | string | undefined): readonly { readonly clipId: string; readonly weight: number }[] {
  const children = [...blendTree.children].sort((left, right) => left.threshold - right.threshold);
  if (!children.length) {
    return [];
  }
  const value = Number(parameterValue ?? 0);
  const first = children[0]!;
  const last = children[children.length - 1]!;
  const lower = [...children].reverse().find((child) => child.threshold <= value) ?? first;
  const upper = children.find((child) => child.threshold >= value) ?? last;
  if (lower.clipId === upper.clipId || lower.threshold === upper.threshold) {
    return [{ clipId: lower.clipId, weight: 1 }];
  }
  const alpha = Math.max(0, Math.min(1, (value - lower.threshold) / (upper.threshold - lower.threshold)));
  return [
    { clipId: lower.clipId, weight: Number((1 - alpha).toFixed(3)) },
    { clipId: upper.clipId, weight: Number(alpha.toFixed(3)) }
  ].filter((entry) => entry.weight > 0);
}

function normalizeBlendTreeForProject(state: EditorProjectState, blendTree: BlendTree1D): BlendTree1D | undefined {
  if (typeof state.stateMachine.parameters[blendTree.parameter] !== "number") {
    return undefined;
  }
  const children = blendTree.children
    .filter((child) => state.animations[child.clipId] && Number.isFinite(child.threshold))
    .map((child) => ({ threshold: Number(child.threshold), clipId: child.clipId }))
    .sort((left, right) => left.threshold - right.threshold);
  return children.length ? { type: "1d", parameter: blendTree.parameter, children } : undefined;
}

function renameAnimation(state: EditorProjectState, clipId: string, nextId: string): EditorProjectState {
  const clip = state.animations[clipId];
  if (!clip || state.animations[nextId]) {
    return state;
  }
  const { [clipId]: _removedClip, ...animations } = state.animations;
  return {
    ...markDirty(state, nextId, "animations"),
    animations: { ...animations, [nextId]: { ...clip, id: nextId } },
    stateMachine: {
      ...state.stateMachine,
      states: state.stateMachine.states.map((stateItem) => (stateItem.clipId === clipId ? { ...stateItem, clipId: nextId } : stateItem))
    }
  };
}

function addJointToTopology(topology: EditorRigTopology, boneId: string): EditorRigTopology {
  if (topology.joints[boneId]) return topology;
  return {
    ...topology,
    joints: { ...topology.joints, [boneId]: { id: boneId, name: humanizeEditorId(boneId), boneId } }
  };
}

function ensureTopologyGroup(topology: EditorRigTopology, groupId: string): EditorRigTopology {
  if (topology.groups[groupId]) return topology;
  return {
    ...topology,
    groups: { ...topology.groups, [groupId]: { id: groupId, name: humanizeEditorId(groupId), boneIds: [] } }
  };
}

function connectTopologyJoints(topology: EditorRigTopology, startJointId: string, endJointId: string, groupId: string): EditorRigTopology {
  const group = topology.groups[groupId] ?? { id: groupId, name: humanizeEditorId(groupId), boneIds: [] };
  const id = `${startJointId}--${endJointId}`;
  const existingSegments = Object.fromEntries(Object.entries(topology.segments).filter(([, segment]) => segment.endJointId !== endJointId));
  return {
    ...topology,
    segments: {
      ...existingSegments,
      [id]: { id, name: humanizeEditorId(endJointId), startJointId, endJointId, boneId: endJointId, groupId }
    },
    groups: {
      ...topology.groups,
      [groupId]: { ...group, boneIds: group.boneIds.includes(endJointId) ? group.boneIds : [...group.boneIds, endJointId] }
    },
    activeGroupId: groupId
  };
}

function removeTopologyBone(topology: EditorRigTopology, boneId: string): EditorRigTopology {
  const joints = Object.fromEntries(Object.entries(topology.joints).filter(([id]) => id !== boneId));
  const segments = Object.fromEntries(Object.entries(topology.segments).filter(([, segment]) => segment.startJointId !== boneId && segment.endJointId !== boneId && segment.boneId !== boneId));
  const groups = Object.fromEntries(Object.entries(topology.groups).map(([id, group]) => [id, { ...group, boneIds: group.boneIds.filter((item) => item !== boneId) }]));
  return { ...topology, joints, segments, groups };
}

function renameTopologyBone(topology: EditorRigTopology, boneId: string, nextId: string): EditorRigTopology {
  const joints = Object.fromEntries(Object.entries(topology.joints).map(([id, joint]) => {
    const nextJointId = id === boneId ? nextId : id;
    return [nextJointId, joint.boneId === boneId ? { ...joint, id: nextJointId, name: humanizeEditorId(nextId), boneId: nextId } : joint];
  }));
  const segments = Object.fromEntries(Object.values(topology.segments).map((segment) => {
    const next = {
      ...segment,
      startJointId: segment.startJointId === boneId ? nextId : segment.startJointId,
      endJointId: segment.endJointId === boneId ? nextId : segment.endJointId,
      boneId: segment.boneId === boneId ? nextId : segment.boneId
    };
    const id = `${next.startJointId}--${next.endJointId}`;
    return [id, { ...next, id }];
  }));
  const groups = Object.fromEntries(Object.entries(topology.groups).map(([id, group]) => [id, { ...group, boneIds: group.boneIds.map((item) => item === boneId ? nextId : item) }]));
  return { ...topology, joints, segments, groups };
}

function wouldCreateCycle(parents: Readonly<Record<string, string | null>>, boneId: string, parentId: string): boolean {
  let cursor: string | null | undefined = parentId;
  while (cursor) {
    if (cursor === boneId) return true;
    cursor = parents[cursor];
  }
  return false;
}

function calculateBoneWorldPosition(state: EditorProjectState, boneId: string): readonly [number, number] {
  const transform = state.bones[boneId];
  if (!transform) return [0, 0];
  const parentId = state.parents[boneId];
  if (!parentId) return [transform.x, transform.y];
  const parentPosition = calculateBoneWorldPosition(state, parentId);
  const parentRotation = calculateBoneWorldRotation(state, parentId);
  const cos = Math.cos(parentRotation);
  const sin = Math.sin(parentRotation);
  return [parentPosition[0] + transform.x * cos - transform.y * sin, parentPosition[1] + transform.x * sin + transform.y * cos];
}

function calculateBoneWorldRotation(state: EditorProjectState, boneId: string): number {
  const transform = state.bones[boneId];
  if (!transform) return 0;
  const parentId = state.parents[boneId];
  return transform.rotation + (parentId ? calculateBoneWorldRotation(state, parentId) : 0);
}

function hasPartDeformTracks(state: EditorProjectState, partId: string): boolean {
  const trackId = `${partId}.deform`;
  return Object.values(state.animations).some((clip) => (clip.tracks[trackId]?.length ?? 0) > 0);
}

function normalizeMeshSkin(skin: NonNullable<MeshShape["skin"]>): NonNullable<MeshShape["skin"]> {
  return skin.map((influences) => {
    const strongest = [...influences]
      .filter((influence) => Number.isFinite(influence.weight) && influence.weight > 0)
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 4);
    const total = strongest.reduce((sum, influence) => sum + influence.weight, 0);
    if (total <= 0) return [];
    return strongest.map((influence) => ({ ...influence, weight: influence.weight / total }));
  });
}
