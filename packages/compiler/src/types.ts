import type {
  AnimationConditionOperator,
  AnimationParameterType,
  AnimationTrackProperty,
  BonesRuntimeTarget,
  BonesSchemaVersion,
  JsonValue,
  PartType,
  ProceduralPreset
} from "@bones/schema";

export const BONES_COMPILED_FORMAT_VERSION = "1.0.0" as const;

export type NumericId = number;
export type PackedTransform2D = readonly [
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  skewX: number,
  skewY: number
];

export interface CompiledRigProjectV1 {
  readonly compiledFormatVersion: typeof BONES_COMPILED_FORMAT_VERSION;
  readonly schemaVersion: BonesSchemaVersion;
  readonly runtimeTarget: BonesRuntimeTarget;
  readonly sourceProjectId: string;
  readonly name: string;
  readonly rig: CompiledRigV1;
  readonly animations: readonly CompiledAnimationClipV1[];
  readonly stateMachines: readonly CompiledStateMachineV1[];
  readonly lookups: CompiledLookupTablesV1;
}

export interface CompiledRigV1 {
  readonly id: NumericId;
  readonly rootBone: NumericId;
  readonly bones: readonly CompiledBoneV1[];
  readonly parts: readonly CompiledPartV1[];
}

export interface CompiledBoneV1 {
  readonly id: NumericId;
  readonly parent: NumericId;
  readonly local: PackedTransform2D;
  readonly length: number;
}

export interface CompiledPartV1 {
  readonly id: NumericId;
  readonly bone: NumericId;
  readonly type: PartType;
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
    readonly commands: readonly JsonValue[];
  };
  readonly procedural?: {
    readonly preset: ProceduralPreset;
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

export interface CompiledAnimationClipV1 {
  readonly id: NumericId;
  readonly duration: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly tracks: readonly CompiledAnimationTrackV1[];
  readonly trackLookup: Readonly<Record<string, NumericId>>;
}

export interface CompiledAnimationTrackV1 {
  readonly id: NumericId;
  readonly targetKind: "bone" | "part" | "project" | "stateMachine";
  readonly target: NumericId;
  readonly property: AnimationTrackProperty;
  readonly keyframes: readonly CompiledKeyframeV1[];
}

export interface CompiledKeyframeV1 {
  readonly time: number;
  readonly value: JsonValue;
  readonly interpolation: "linear" | "step" | "hold" | "bezier" | "spring";
  readonly curve: readonly [number, number, number, number];
}

export interface CompiledStateMachineV1 {
  readonly id: NumericId;
  readonly initialState: NumericId;
  readonly states: readonly CompiledStateV1[];
  readonly transitions: readonly CompiledTransitionV1[];
  readonly parameters: readonly CompiledParameterV1[];
  readonly stateLookup: Readonly<Record<string, NumericId>>;
  readonly parameterLookup: Readonly<Record<string, NumericId>>;
}

export interface CompiledStateV1 {
  readonly id: NumericId;
  readonly clip: NumericId;
  readonly blendTree?: {
    readonly type: "1d";
    readonly parameter: NumericId;
    readonly children: readonly {
      readonly threshold: number;
      readonly clip: NumericId;
    }[];
  };
}

export interface CompiledTransitionV1 {
  readonly id: NumericId;
  readonly from: NumericId;
  readonly to: NumericId;
  readonly duration: number;
  readonly easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "cubicBezier" | "spring" | "overshoot" | "anticipation";
  readonly priority: number;
  readonly canInterrupt: boolean;
  readonly syncMode: "none" | "normalizedTime" | "phaseMatch";
  readonly conditions: readonly CompiledConditionV1[];
}

export interface CompiledParameterV1 {
  readonly id: NumericId;
  readonly type: AnimationParameterType;
  readonly defaultValue: string | number | boolean;
}

export interface CompiledConditionV1 {
  readonly parameter: NumericId;
  readonly operator: AnimationConditionOperator;
  readonly value: string | number | boolean;
}

export interface CompiledLookupTablesV1 {
  readonly rigs: Readonly<Record<string, NumericId>>;
  readonly bones: Readonly<Record<string, NumericId>>;
  readonly parts: Readonly<Record<string, NumericId>>;
  readonly animations: Readonly<Record<string, NumericId>>;
  readonly stateMachines: Readonly<Record<string, NumericId>>;
}

export interface CompileOptions {
  readonly rigId?: string;
  readonly defaultFrameRate?: number;
}

export interface CompileIssue {
  readonly path: string;
  readonly message: string;
}
