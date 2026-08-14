import type { ShapePart } from "./editorState";

export interface PlacementBoneTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface PlacementFrame {
  readonly bounds: PlacementBounds;
  readonly corners: Readonly<Record<PlacementCorner, readonly [number, number]>>;
  readonly edges: Readonly<Record<PlacementEdge, readonly [number, number]>>;
  readonly center: readonly [number, number];
  readonly pivot: readonly [number, number];
  readonly rotationHandle: readonly [number, number];
}

export interface PlacementBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type PlacementCorner = "nw" | "ne" | "se" | "sw";
export type PlacementEdge = "n" | "e" | "s" | "w";
export type PlacementScaleHandle = PlacementCorner | PlacementEdge;

const minimumScale = 0.02;

export function createPlacementFrame(part: ShapePart, bone: PlacementBoneTransform, bones?: Readonly<Record<string, PlacementBoneTransform>>): PlacementFrame | undefined {
  const bounds = partPlacementBounds(part, bones);
  if (!bounds) return undefined;
  const corners = {
    nw: partPointToWorld(part, [bounds.minX, bounds.minY], bone),
    ne: partPointToWorld(part, [bounds.maxX, bounds.minY], bone),
    se: partPointToWorld(part, [bounds.maxX, bounds.maxY], bone),
    sw: partPointToWorld(part, [bounds.minX, bounds.maxY], bone)
  } as const;
  const edges = {
    n: midpoint(corners.nw, corners.ne),
    e: midpoint(corners.ne, corners.se),
    s: midpoint(corners.sw, corners.se),
    w: midpoint(corners.nw, corners.sw)
  } as const;
  const center = midpoint(corners.nw, corners.se);
  const pivot = partPointToWorld(part, part.pivot ?? [0, 0], bone);
  const outward = normalized([edges.n[0] - center[0], edges.n[1] - center[1]]);
  const rotationHandle: readonly [number, number] = [edges.n[0] + outward[0] * 28, edges.n[1] + outward[1] * 28];
  return { bounds, corners, edges, center, pivot, rotationHandle };
}

export function movePlacement(
  part: ShapePart,
  bone: PlacementBoneTransform,
  startWorld: readonly [number, number],
  currentWorld: readonly [number, number]
): Pick<ShapePart, "offset"> {
  const delta = worldDeltaToBoneLocal([currentWorld[0] - startWorld[0], currentWorld[1] - startWorld[1]], bone);
  const offset = part.offset ?? [0, 0];
  return { offset: [offset[0] + delta[0], offset[1] + delta[1]] };
}

export function rotatePlacement(
  part: ShapePart,
  bone: PlacementBoneTransform,
  startWorld: readonly [number, number],
  currentWorld: readonly [number, number]
): Pick<ShapePart, "rotation"> {
  const pivot = partPointToWorld(part, part.pivot ?? [0, 0], bone);
  const startAngle = Math.atan2(startWorld[1] - pivot[1], startWorld[0] - pivot[0]);
  const currentAngle = Math.atan2(currentWorld[1] - pivot[1], currentWorld[0] - pivot[0]);
  return { rotation: normalizeRadians((part.rotation ?? 0) + currentAngle - startAngle) };
}

export function scalePlacement(
  part: ShapePart,
  bone: PlacementBoneTransform,
  handle: PlacementScaleHandle,
  currentWorld: readonly [number, number],
  bones?: Readonly<Record<string, PlacementBoneTransform>>
): Pick<ShapePart, "offset" | "scale"> | undefined {
  const bounds = partPlacementBounds(part, bones);
  if (!bounds) return undefined;
  const [handlePoint, oppositePoint] = scaleHandlePoints(bounds, handle);
  const rotation = part.rotation ?? 0;
  const pivot = part.pivot ?? [0, 0];
  const startScale = part.scale ?? [1, 1];
  const oppositeWorld = partPointToWorld(part, oppositePoint, bone);
  const oppositeBone = worldToBoneLocal(oppositeWorld, bone);
  const pointerBone = worldToBoneLocal(currentWorld, bone);
  const currentDelta = rotatePoint([pointerBone[0] - oppositeBone[0], pointerBone[1] - oppositeBone[1]], -rotation);
  const sourceDelta: readonly [number, number] = [handlePoint[0] - oppositePoint[0], handlePoint[1] - oppositePoint[1]];

  let scaleX = startScale[0];
  let scaleY = startScale[1];
  const isCorner = handle.length === 2;
  if (part.aspectLocked && isCorner) {
    const startDelta: readonly [number, number] = [sourceDelta[0] * startScale[0], sourceDelta[1] * startScale[1]];
    const lengthSquared = startDelta[0] ** 2 + startDelta[1] ** 2;
    const factor = lengthSquared > Number.EPSILON
      ? Math.max(minimumScale / Math.max(Math.abs(startScale[0]), Math.abs(startScale[1]), minimumScale), (currentDelta[0] * startDelta[0] + currentDelta[1] * startDelta[1]) / lengthSquared)
      : 1;
    scaleX = signedMagnitude(startScale[0], Math.abs(startScale[0] * factor));
    scaleY = signedMagnitude(startScale[1], Math.abs(startScale[1] * factor));
  } else {
    if (sourceDelta[0] !== 0) scaleX = preserveScaleSign(currentDelta[0] / sourceDelta[0], startScale[0]);
    if (sourceDelta[1] !== 0) scaleY = preserveScaleSign(currentDelta[1] / sourceDelta[1], startScale[1]);
    if (part.aspectLocked) {
      const changed = sourceDelta[0] !== 0 ? Math.abs(scaleX / safeScale(startScale[0])) : Math.abs(scaleY / safeScale(startScale[1]));
      scaleX = signedMagnitude(startScale[0], Math.abs(startScale[0]) * changed);
      scaleY = signedMagnitude(startScale[1], Math.abs(startScale[1]) * changed);
    }
  }

  const scaledOpposite: readonly [number, number] = [(oppositePoint[0] - pivot[0]) * scaleX, (oppositePoint[1] - pivot[1]) * scaleY];
  const rotatedOpposite = rotatePoint(scaledOpposite, rotation);
  return {
    offset: [oppositeBone[0] - rotatedOpposite[0], oppositeBone[1] - rotatedOpposite[1]],
    scale: [scaleX, scaleY]
  };
}

export function partPointToWorld(part: ShapePart, point: readonly [number, number], bone: PlacementBoneTransform): readonly [number, number] {
  const pivot = part.pivot ?? [0, 0];
  const scale = part.scale ?? [1, 1];
  const offset = part.offset ?? [0, 0];
  const rotated = rotatePoint([(point[0] - pivot[0]) * scale[0], (point[1] - pivot[1]) * scale[1]], part.rotation ?? 0);
  const attached: readonly [number, number] = [rotated[0] + offset[0], rotated[1] + offset[1]];
  const boneRotated = rotatePoint([attached[0] * bone.scaleX, attached[1] * bone.scaleY], bone.rotation);
  return [bone.x + boneRotated[0], bone.y + boneRotated[1]];
}

export function worldDeltaToBoneLocal(delta: readonly [number, number], bone: PlacementBoneTransform): readonly [number, number] {
  const rotated = rotatePoint(delta, -bone.rotation);
  return [rotated[0] / safeScale(bone.scaleX), rotated[1] / safeScale(bone.scaleY)];
}

export function partPlacementBounds(part: ShapePart, bones?: Readonly<Record<string, PlacementBoneTransform>>): PlacementBounds | undefined {
  const skinned = bones && part.mesh?.skin?.length ? skinnedPartBounds(part, bones) : undefined;
  if (skinned) return skinned;
  const mesh = numericBounds(part.mesh?.vertices ?? []);
  if (mesh) return mesh;
  if (part.svgViewBox && part.svgViewBox[2] > 0 && part.svgViewBox[3] > 0) {
    const [x, y, width, height] = part.svgViewBox;
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  const points = numericBounds(part.points.flatMap(([x, y]) => [x, y]));
  if (points) return points;
  if (part.intrinsicSize) {
    const [width, height] = part.intrinsicSize;
    return { minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2 };
  }
  return undefined;
}

function skinnedPartBounds(part: ShapePart, bones: Readonly<Record<string, PlacementBoneTransform>>): PlacementBounds | undefined {
  const target = bones[part.boneId];
  if (!target || !part.mesh?.skin?.length) return undefined;
  const vertices: number[] = [];
  for (const influences of part.mesh.skin) {
    let worldX = 0;
    let worldY = 0;
    let totalWeight = 0;
    for (const influence of influences) {
      const influenceBone = bones[influence.boneId];
      if (!influenceBone) continue;
      const world = bonePointToWorld([influence.x, influence.y], influenceBone);
      worldX += world[0] * influence.weight;
      worldY += world[1] * influence.weight;
      totalWeight += influence.weight;
    }
    if (totalWeight <= Number.EPSILON) continue;
    const local = worldToBoneLocal([worldX / totalWeight, worldY / totalWeight], target);
    vertices.push(local[0], local[1]);
  }
  return numericBounds(vertices);
}

function scaleHandlePoints(bounds: PlacementBounds, handle: PlacementScaleHandle): readonly [readonly [number, number], readonly [number, number]] {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const points = {
    nw: [[bounds.minX, bounds.minY], [bounds.maxX, bounds.maxY]],
    ne: [[bounds.maxX, bounds.minY], [bounds.minX, bounds.maxY]],
    se: [[bounds.maxX, bounds.maxY], [bounds.minX, bounds.minY]],
    sw: [[bounds.minX, bounds.maxY], [bounds.maxX, bounds.minY]],
    n: [[centerX, bounds.minY], [centerX, bounds.maxY]],
    e: [[bounds.maxX, centerY], [bounds.minX, centerY]],
    s: [[centerX, bounds.maxY], [centerX, bounds.minY]],
    w: [[bounds.minX, centerY], [bounds.maxX, centerY]]
  } as const;
  return points[handle];
}

function worldToBoneLocal(point: readonly [number, number], bone: PlacementBoneTransform): readonly [number, number] {
  return worldDeltaToBoneLocal([point[0] - bone.x, point[1] - bone.y], bone);
}

function bonePointToWorld(point: readonly [number, number], bone: PlacementBoneTransform): readonly [number, number] {
  const rotated = rotatePoint([point[0] * bone.scaleX, point[1] * bone.scaleY], bone.rotation);
  return [bone.x + rotated[0], bone.y + rotated[1]];
}

function rotatePoint(point: readonly [number, number], rotation: number): readonly [number, number] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
}

function numericBounds(values: readonly number[]): PlacementBounds | undefined {
  if (values.length < 4 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 2) {
    minX = Math.min(minX, values[index] ?? minX);
    minY = Math.min(minY, values[index + 1] ?? minY);
    maxX = Math.max(maxX, values[index] ?? maxX);
    maxY = Math.max(maxY, values[index + 1] ?? maxY);
  }
  return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : undefined;
}

function preserveScaleSign(candidate: number, original: number): number {
  const magnitude = Math.max(minimumScale, candidate * (original < 0 ? -1 : 1));
  return signedMagnitude(original, magnitude);
}

function signedMagnitude(source: number, magnitude: number): number {
  return (source < 0 ? -1 : 1) * Math.max(minimumScale, magnitude);
}

function safeScale(value: number): number {
  if (Math.abs(value) >= 0.0001) return value;
  return value < 0 ? -0.0001 : 0.0001;
}

function midpoint(left: readonly [number, number], right: readonly [number, number]): readonly [number, number] {
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
}

function normalized(point: readonly [number, number]): readonly [number, number] {
  const length = Math.hypot(point[0], point[1]);
  return length > Number.EPSILON ? [point[0] / length, point[1] / length] : [0, -1];
}

function normalizeRadians(value: number): number {
  const full = Math.PI * 2;
  return ((value + Math.PI) % full + full) % full - Math.PI;
}
