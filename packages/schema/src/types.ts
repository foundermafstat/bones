export const BONES_SCHEMA_VERSION = "1.0.0" as const;
export const BONES_RUNTIME_TARGET = "pixi-v8" as const;

export type BonesSchemaVersion = typeof BONES_SCHEMA_VERSION;
export type BonesRuntimeTarget = typeof BONES_RUNTIME_TARGET;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface RigProject {
  readonly schemaVersion: BonesSchemaVersion;
  readonly runtimeTarget: BonesRuntimeTarget;
  readonly id: string;
  readonly name: string;
  readonly rigs: readonly RigDefinition[];
  readonly animations?: readonly AnimationClip[];
  readonly poses?: readonly PoseDefinition[];
  readonly stateMachines?: readonly AnimationStateMachine[];
  readonly editor?: EditorMetadata;
}

export interface RigDefinition {
  readonly id: string;
  readonly name: string;
  readonly rootBoneId: string;
  readonly bones: readonly BoneDefinition[];
  readonly parts?: readonly PartDefinition[];
  readonly editor?: EditorMetadata;
}

export interface BoneDefinition {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
  readonly transform: Transform2D;
  readonly length?: number;
  readonly editor?: EditorMetadata;
}

export interface Transform2D {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly skewX?: number;
  readonly skewY?: number;
}

export type PartType = "path" | "procedural" | "mesh" | "svg";

export interface PartDefinition {
  readonly id: string;
  readonly name: string;
  readonly boneId: string;
  readonly type: PartType;
  readonly drawOrder?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly transform?: Transform2D;
  readonly fill?: FillStyle;
  readonly path?: PathShape;
  readonly procedural?: ProceduralShape;
  readonly mesh?: MeshShape;
  readonly svg?: SvgShape;
  readonly editor?: EditorMetadata;
}

export interface FillStyle {
  readonly color: string;
  readonly alpha?: number;
}

export type PathCommand =
  | { readonly type: "M" | "L"; readonly x: number; readonly y: number }
  | { readonly type: "Q"; readonly cx: number; readonly cy: number; readonly x: number; readonly y: number }
  | {
      readonly type: "C";
      readonly c1x: number;
      readonly c1y: number;
      readonly c2x: number;
      readonly c2y: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: "Z" };

export interface PathShape {
  readonly commands: readonly PathCommand[];
  readonly closed?: boolean;
}

export type ProceduralPreset =
  | "tapered-limb"
  | "organic-blob"
  | "capsule"
  | "circle"
  | "rect";

export interface ProceduralShape {
  readonly preset: ProceduralPreset;
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

export interface MeshShape {
  readonly vertices: readonly number[];
  readonly indices: readonly number[];
}

export interface SvgShape {
  readonly source: string;
  readonly viewBox?: readonly [number, number, number, number];
}

export interface AnimationClip {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly fps?: number;
  readonly loop?: boolean;
  readonly tracks: readonly AnimationTrack[];
  readonly editor?: EditorMetadata;
}

export type AnimationTrackTargetKind = "bone" | "part" | "project" | "stateMachine";

export interface AnimationTrackTarget {
  readonly kind: AnimationTrackTargetKind;
  readonly id: string;
}

export type AnimationTrackProperty =
  | "transform.x"
  | "transform.y"
  | "transform.rotation"
  | "transform.scaleX"
  | "transform.scaleY"
  | "transform.skewX"
  | "transform.skewY"
  | "visible"
  | "opacity"
  | "drawOrder"
  | "procedural.params";

export interface AnimationTrack {
  readonly id: string;
  readonly target: AnimationTrackTarget;
  readonly property: AnimationTrackProperty;
  readonly keyframes: readonly Keyframe[];
}

export type KeyframeInterpolation = "linear" | "step" | "hold" | "bezier";

export interface Keyframe {
  readonly time: number;
  readonly value: JsonValue;
  readonly interpolation?: KeyframeInterpolation;
  readonly curve?: readonly [number, number, number, number];
  readonly editor?: EditorMetadata;
}

export interface PoseDefinition {
  readonly id: string;
  readonly name: string;
  readonly rigId: string;
  readonly boneTransforms: Readonly<Record<string, Transform2D>>;
  readonly partProperties?: Readonly<Record<string, PosePartProperties>>;
  readonly editor?: EditorMetadata;
}

export interface PosePartProperties {
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly drawOrder?: number;
}

export interface AnimationStateMachine {
  readonly id: string;
  readonly name: string;
  readonly initialStateId: string;
  readonly states: readonly AnimationState[];
  readonly transitions?: readonly AnimationTransition[];
  readonly parameters?: readonly AnimationParameter[];
  readonly editor?: EditorMetadata;
}

export interface AnimationState {
  readonly id: string;
  readonly name: string;
  readonly clipId?: string;
  readonly blendTree?: BlendTree1D;
  readonly editor?: EditorMetadata;
}

export interface BlendTree1D {
  readonly type: "1d";
  readonly parameter: string;
  readonly children: readonly BlendTreeChild[];
}

export interface BlendTreeChild {
  readonly threshold: number;
  readonly clipId: string;
}

export interface AnimationTransition {
  readonly id: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly duration: number;
  readonly priority?: number;
  readonly canInterrupt?: boolean;
  readonly conditions?: readonly AnimationCondition[];
}

export type AnimationParameterType = "number" | "boolean" | "string";

export interface AnimationParameter {
  readonly id: string;
  readonly type: AnimationParameterType;
  readonly defaultValue: string | number | boolean;
}

export type AnimationConditionOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";

export interface AnimationCondition {
  readonly parameterId: string;
  readonly operator: AnimationConditionOperator;
  readonly value: string | number | boolean;
}

export interface EditorMetadata {
  readonly label?: string;
  readonly notes?: string;
  readonly color?: string;
  readonly collapsed?: boolean;
  readonly locked?: boolean;
  readonly visible?: boolean;
  readonly tags?: readonly string[];
  readonly custom?: Readonly<Record<string, JsonValue>>;
}
