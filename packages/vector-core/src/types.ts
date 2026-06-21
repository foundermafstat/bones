export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export type PathCommand =
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
  | { readonly cmd: "Z" };

export interface VectorPath {
  readonly commands: readonly PathCommand[];
  readonly closed?: boolean;
}

export type PathDirection = "clockwise" | "counterclockwise" | "flat";

export interface SvgPathSource {
  readonly type: "svg";
  readonly source: string;
  readonly viewBox?: readonly [number, number, number, number];
}

export interface ProceduralTaperedLimbOptions {
  readonly length: number;
  readonly startWidth: number;
  readonly endWidth: number;
  readonly bend?: number;
  readonly softness?: number;
}

export interface OrganicBlobOptions {
  readonly radiusX: number;
  readonly radiusY: number;
  readonly asymmetry?: number;
}

export type PixiGraphicsCommand =
  | { readonly method: "moveTo"; readonly args: readonly [number, number] }
  | { readonly method: "lineTo"; readonly args: readonly [number, number] }
  | { readonly method: "quadraticCurveTo"; readonly args: readonly [number, number, number, number] }
  | { readonly method: "bezierCurveTo"; readonly args: readonly [number, number, number, number, number, number] }
  | { readonly method: "closePath"; readonly args: readonly [] };
