import type { MeshShape } from "@bones/schema";
import type { ShapePart } from "./editorState";

export interface RasterIntrinsicSize {
  readonly width: number;
  readonly height: number;
}

export interface AspectLockedRasterPlacement {
  readonly mesh: MeshShape;
  readonly pivot: readonly [number, number];
  readonly offset: readonly [number, number];
  readonly rotation: number;
  readonly scale: readonly [number, number];
}

const defaultMaximumDimension = 240;

export function createAspectLockedRasterPlacement(
  intrinsicSize: RasterIntrinsicSize,
  texture: string,
  target?: ShapePart
): AspectLockedRasterPlacement {
  const intrinsicWidth = positiveDimension(intrinsicSize.width);
  const intrinsicHeight = positiveDimension(intrinsicSize.height);
  const targetBounds = target ? partLocalBounds(target) : undefined;

  if (!target || !targetBounds) {
    const uniformScale = Math.min(1, defaultMaximumDimension / Math.max(intrinsicWidth, intrinsicHeight));
    return {
      mesh: rectangleMesh(0, 0, intrinsicWidth * uniformScale, intrinsicHeight * uniformScale, texture),
      pivot: [0, 0],
      offset: [0, 0],
      rotation: 0,
      scale: [1, 1]
    };
  }

  const pivot = target.pivot ?? [0, 0];
  const offset = target.offset ?? [0, 0];
  const currentScale = target.scale ?? [1, 1];
  const signX = currentScale[0] < 0 ? -1 : 1;
  const signY = currentScale[1] < 0 ? -1 : 1;
  const targetWidth = targetBounds.width * Math.max(Math.abs(currentScale[0]), Number.EPSILON);
  const targetHeight = targetBounds.height * Math.max(Math.abs(currentScale[1]), Number.EPSILON);
  const uniformFit = Math.min(targetWidth / intrinsicWidth, targetHeight / intrinsicHeight);
  const width = intrinsicWidth * uniformFit;
  const height = intrinsicHeight * uniformFit;
  const currentCenterX = (targetBounds.centerX - pivot[0]) * currentScale[0] + offset[0];
  const currentCenterY = (targetBounds.centerY - pivot[1]) * currentScale[1] + offset[1];
  const localCenterX = pivot[0] + (currentCenterX - offset[0]) / signX;
  const localCenterY = pivot[1] + (currentCenterY - offset[1]) / signY;

  return {
    mesh: rectangleMesh(localCenterX, localCenterY, width, height, texture),
    pivot,
    offset,
    rotation: target.rotation ?? 0,
    scale: [signX, signY]
  };
}

function partLocalBounds(part: ShapePart): { readonly centerX: number; readonly centerY: number; readonly width: number; readonly height: number } | undefined {
  const meshBounds = numericBounds(part.mesh?.vertices ?? []);
  if (meshBounds) return meshBounds;

  if (part.svgViewBox && part.svgViewBox[2] > 0 && part.svgViewBox[3] > 0) {
    const [x, y, width, height] = part.svgViewBox;
    return { centerX: x + width / 2, centerY: y + height / 2, width, height };
  }

  return numericBounds(part.points.flatMap(([x, y]) => [x, y]));
}

function numericBounds(values: readonly number[]): { readonly centerX: number; readonly centerY: number; readonly width: number; readonly height: number } | undefined {
  if (values.length < 4 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) return undefined;
  const xs = values.filter((_, index) => index % 2 === 0);
  const ys = values.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX <= minX || maxY <= minY) return undefined;
  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}

function rectangleMesh(centerX: number, centerY: number, width: number, height: number, texture: string): MeshShape {
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  return {
    vertices: [left, top, left + width, top, left + width, top + height, left, top + height],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    texture
  };
}

function positiveDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Raster dimensions must be positive finite numbers.");
  return value;
}
