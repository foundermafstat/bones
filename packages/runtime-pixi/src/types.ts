import type { Container } from "pixi.js";

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
}

export interface RigInstanceOptions {
  readonly quality?: "low" | "medium" | "high";
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
}

export interface RigUpdateState {
  readonly elapsed: number;
  readonly lastDelta: number;
  readonly params: AnimationParameters;
}
