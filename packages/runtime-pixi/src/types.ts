import type { Container, Graphics, GraphicsContext, Mesh, MeshGeometry } from "pixi.js";

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
}

export interface RigUpdateState {
  readonly elapsed: number;
  readonly lastDelta: number;
  readonly params: AnimationParameters;
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
