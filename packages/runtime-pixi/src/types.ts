import type { Container, Graphics, GraphicsContext, Mesh, MeshGeometry } from "pixi.js";
import type { ConstraintSolverConfig, RaycastWorld } from "./ConstraintSolver.js";
import type { ProceduralLayerConfig } from "./ProceduralLayers.js";

export type NumericId = number;
export type AnimationParameterValue = string | number | boolean;
export type AnimationParameters = Readonly<Record<string, AnimationParameterValue>>;
export type PackedTransform2D = readonly [
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  skewX: number,
  skewY: number
];

export interface RuntimeCompiledRig {
  readonly compiledFormatVersion: string;
  readonly schemaVersion: string;
  readonly runtimeTarget: "pixi-v8";
  readonly sourceProjectId: string;
  readonly name: string;
  readonly rig: RuntimeCompiledRigData;
  readonly animations?: readonly RuntimeAnimationClip[];
  readonly stateMachines?: readonly RuntimeStateMachine[];
  readonly lookups?: RuntimeLookupTables;
}

export interface RuntimeLookupTables {
  readonly rigs: Readonly<Record<string, NumericId>>;
  readonly bones: Readonly<Record<string, NumericId>>;
  readonly parts: Readonly<Record<string, NumericId>>;
  readonly animations: Readonly<Record<string, NumericId>>;
  readonly stateMachines: Readonly<Record<string, NumericId>>;
}

export interface RuntimeCompiledRigData {
  readonly id: NumericId;
  readonly rootBone: NumericId;
  readonly bones: readonly RuntimeCompiledBone[];
  readonly parts: readonly RuntimeCompiledPart[];
}

export interface RuntimeCompiledBone {
  readonly id: NumericId;
  readonly parent: NumericId;
  readonly local: PackedTransform2D;
  readonly length: number;
}

export interface RuntimeCompiledPart {
  readonly id: NumericId;
  readonly bone: NumericId;
  readonly type: string;
  readonly drawOrder: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly local: PackedTransform2D;
  readonly fill?: {
    readonly color: string;
    readonly alpha: number;
  };
  readonly path?: {
    readonly closed: boolean;
    readonly commands: readonly RuntimePathCommand[];
  };
  readonly procedural?: {
    readonly preset: string;
    readonly params: Readonly<Record<string, string | number | boolean>>;
  };
  readonly mesh?: {
    readonly vertices: readonly number[];
    readonly indices: readonly number[];
  };
  readonly svg?: {
    readonly source: string;
    readonly viewBox?: readonly [number, number, number, number];
  };
}

export interface RigInstanceOptions {
  readonly quality?: "low" | "medium" | "high";
  readonly stateMachine?: NumericId | false;
  readonly proceduralLayers?: readonly ProceduralLayerConfig[];
  readonly constraints?: {
    readonly config: ConstraintSolverConfig;
    readonly world: RaycastWorld;
  };
}

export interface BoneRuntime {
  readonly id: NumericId;
  readonly parent: NumericId;
  readonly local: PackedTransform2D;
  readonly length: number;
  readonly container: Container;
}

export interface PartRuntime {
  readonly id: NumericId;
  readonly bone: NumericId;
  readonly type: string;
  readonly drawOrder: number;
  readonly local: PackedTransform2D;
  readonly container: Container;
  readonly renderable?: Graphics | Mesh<MeshGeometry>;
  readonly graphicsContext?: GraphicsContext;
  readonly meshBaseVertices?: Float32Array;
  readonly meshPositions?: Float32Array;
}

export interface RigUpdateState {
  readonly elapsed: number;
  readonly lastDelta: number;
  readonly params: AnimationParameters;
  readonly activeClip?: NumericId;
  readonly previousClip?: NumericId;
  readonly activeState?: NumericId;
  readonly previousState?: NumericId;
  readonly activeTransition?: NumericId;
  readonly transitionWeight: number;
  readonly sampledClipTimes: readonly RigSampledClipTime[];
  readonly sampledValues: number;
  readonly proceduralValues: number;
  readonly constraintValues: number;
  readonly activeLayers: readonly RigActiveAnimationLayer[];
  readonly stateMachine?: RigStateMachineUpdate;
  readonly events: readonly RuntimeAnimationEventDispatch[];
}

export interface RigSampledClipTime {
  readonly clip: NumericId;
  readonly localTime: number;
  readonly normalizedTime: number;
}

export interface RigActiveAnimationLayer {
  readonly source: "base" | "transition" | "blendTree";
  readonly clip: NumericId;
  readonly weight: number;
  readonly additive: boolean;
}

export interface RigStateMachineUpdate {
  readonly state: NumericId;
  readonly previousState?: NumericId;
  readonly transition?: NumericId;
  readonly transitionWeight: number;
  readonly syncMode?: "none" | "normalizedTime" | "phaseMatch";
  readonly timeInState: number;
  readonly clip: NumericId;
  readonly blendTree?: {
    readonly lowerClip: NumericId;
    readonly upperClip: NumericId;
    readonly weight: number;
  };
}

export type RuntimeTrackTargetKind = "bone" | "part" | "project" | "stateMachine";
export type RuntimeTrackProperty =
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
  | "procedural.params"
  | "deform"
  | "event"
  | "collider";
export type RuntimeKeyframeInterpolation = "linear" | "step" | "hold" | "bezier" | "spring";
export type RuntimeSampleValue = string | number | boolean | null | readonly RuntimeSampleValue[] | { readonly [key: string]: RuntimeSampleValue };

export interface RuntimeAnimationClip {
  readonly id: NumericId;
  readonly duration: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly tracks: readonly RuntimeAnimationTrack[];
  readonly trackLookup?: Readonly<Record<string, NumericId>>;
  readonly events?: readonly RuntimeAnimationEvent[];
}

export interface RuntimeAnimationEvent {
  readonly time: number;
  readonly type: string;
  readonly payload?: RuntimeSampleValue;
}

export interface RuntimeAnimationEventDispatch extends RuntimeAnimationEvent {
  readonly clip: NumericId;
  readonly localTime: number;
  readonly normalizedTime: number;
}

export interface RuntimeAnimationTrack {
  readonly id: NumericId;
  readonly targetKind: RuntimeTrackTargetKind;
  readonly target: NumericId;
  readonly property: RuntimeTrackProperty;
  readonly keyframes: readonly RuntimeKeyframe[];
}

export interface RuntimeKeyframe {
  readonly time: number;
  readonly value: RuntimeSampleValue;
  readonly interpolation: RuntimeKeyframeInterpolation;
  readonly curve: readonly [number, number, number, number];
}

export interface AnimationSampleTrackValue {
  targetKind: RuntimeTrackTargetKind;
  target: NumericId;
  property: RuntimeTrackProperty;
  value: RuntimeSampleValue;
}

export interface AnimationSample {
  normalizedTime: number;
  localTime: number;
  readonly values: AnimationSampleTrackValue[];
}

export interface RuntimeStateMachine {
  readonly id: NumericId;
  readonly initialState: NumericId;
  readonly states: readonly RuntimeState[];
  readonly transitions: readonly RuntimeTransition[];
  readonly parameters: readonly RuntimeParameter[];
  readonly stateLookup?: Readonly<Record<string, NumericId>>;
  readonly parameterLookup?: Readonly<Record<string, NumericId>>;
}

export interface RuntimeState {
  readonly id: NumericId;
  readonly clip: NumericId;
  readonly blendTree?: RuntimeBlendTree1D;
}

export interface RuntimeBlendTree1D {
  readonly type: "1d";
  readonly parameter: NumericId;
  readonly children: readonly RuntimeBlendTreeChild[];
}

export interface RuntimeBlendTreeChild {
  readonly threshold: number;
  readonly clip: NumericId;
}

export interface RuntimeTransition {
  readonly id: NumericId;
  readonly from: NumericId;
  readonly to: NumericId;
  readonly duration: number;
  readonly easing?: RuntimeTransitionEasing;
  readonly priority: number;
  readonly canInterrupt: boolean;
  readonly syncMode?: "none" | "normalizedTime" | "phaseMatch";
  readonly transitionClip?: NumericId;
  readonly interruptWindow?: readonly [number, number];
  readonly exitTime?: number;
  readonly minStateTime?: number;
  readonly conditions: readonly RuntimeCondition[];
}

export type RuntimeTransitionEasing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "cubicBezier"
  | "spring"
  | "overshoot"
  | "anticipation";

export interface RuntimeParameter {
  readonly id: NumericId;
  readonly type: "number" | "boolean" | "string";
  readonly defaultValue: AnimationParameterValue;
}

export interface RuntimeCondition {
  readonly parameter: NumericId;
  readonly operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
  readonly value: AnimationParameterValue;
}

export type RuntimePathCommand =
  | { readonly cmd: "M"; readonly x: number; readonly y: number }
  | { readonly cmd: "L"; readonly x: number; readonly y: number }
  | { readonly cmd: "Q"; readonly cpx: number; readonly cpy: number; readonly x: number; readonly y: number }
  | {
      readonly cmd: "C";
      readonly cp1x: number;
      readonly cp1y: number;
      readonly cp2x: number;
      readonly cp2y: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly cmd: "Z" }
  | { readonly type: "M"; readonly x: number; readonly y: number }
  | { readonly type: "L"; readonly x: number; readonly y: number }
  | {
      readonly type: "Q";
      readonly cpx?: number;
      readonly cpy?: number;
      readonly c1x?: number;
      readonly c1y?: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: "C";
      readonly cp1x?: number;
      readonly cp1y?: number;
      readonly cp2x?: number;
      readonly cp2y?: number;
      readonly c1x?: number;
      readonly c1y?: number;
      readonly c2x?: number;
      readonly c2y?: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: "Z" };
