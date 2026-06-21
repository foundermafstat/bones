import { normalizePath } from "./path.js";
import type { PathCommand, Point2D } from "./types.js";

export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export type PathHit =
  | { readonly kind: "point"; readonly index: number; readonly distance: number }
  | { readonly kind: "segment"; readonly index: number; readonly distance: number };

export function getPathBounds(commands: readonly PathCommand[]): Bounds2D {
  const points = normalizePath(commands).flatMap(commandPoints);
  if (!points.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function getPathPivot(commands: readonly PathCommand[]): Point2D {
  const bounds = getPathBounds(commands);
  return { x: bounds.minX + bounds.width * 0.5, y: bounds.minY + bounds.height * 0.5 };
}

export function getBoundsOverlap(left: Bounds2D, right: Bounds2D): Bounds2D | undefined {
  const minX = Math.max(left.minX, right.minX);
  const minY = Math.max(left.minY, right.minY);
  const maxX = Math.min(left.maxX, right.maxX);
  const maxY = Math.min(left.maxY, right.maxY);
  if (maxX <= minX || maxY <= minY) {
    return undefined;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function hitTestPath(commands: readonly PathCommand[], point: Point2D, tolerance = 4): PathHit | undefined {
  const normalized = normalizePath(commands);
  let best: PathHit | undefined;
  for (let index = 0; index < normalized.length; index += 1) {
    const command = normalized[index]!;
    if ("x" in command) {
      best = pickNearest(best, { kind: "point", index, distance: distance(point, command) }, tolerance);
    }
    const previous = previousPoint(normalized, index);
    if (previous && "x" in command) {
      best = pickNearest(best, { kind: "segment", index, distance: pointToSegmentDistance(point, previous, command) }, tolerance);
    }
  }
  return best;
}

export function insertPointOnSegment(commands: readonly PathCommand[], segmentCommandIndex: number, t = 0.5): PathCommand[] {
  const normalized = normalizePath(commands);
  const command = normalized[segmentCommandIndex];
  const previous = previousPoint(normalized, segmentCommandIndex);
  if (!command || !previous || !("x" in command)) {
    return normalized;
  }
  const inserted: PathCommand = {
    cmd: "L",
    x: previous.x + (command.x - previous.x) * clamp01(t),
    y: previous.y + (command.y - previous.y) * clamp01(t)
  };
  return [...normalized.slice(0, segmentCommandIndex), inserted, ...normalized.slice(segmentCommandIndex)];
}

export function deletePathCommand(commands: readonly PathCommand[], commandIndex: number): PathCommand[] {
  const normalized = normalizePath(commands);
  if (commandIndex <= 0 || commandIndex >= normalized.length) {
    return normalized;
  }
  return normalizePath(normalized.filter((_, index) => index !== commandIndex));
}

export function movePathCommandPoint(commands: readonly PathCommand[], commandIndex: number, point: Point2D): PathCommand[] {
  return normalizePath(commands).map((command, index) => {
    if (index !== commandIndex || !("x" in command)) {
      return command;
    }
    return { ...command, x: point.x, y: point.y };
  });
}

export function setCubicHandles(commands: readonly PathCommand[], commandIndex: number, cp1: Point2D, cp2: Point2D): PathCommand[] {
  return normalizePath(commands).map((command, index) =>
    index === commandIndex && command.cmd === "C"
      ? { ...command, cp1x: cp1.x, cp1y: cp1.y, cp2x: cp2.x, cp2y: cp2.y }
      : command
  );
}

export function convertLineToSmoothCubic(commands: readonly PathCommand[], commandIndex: number, softness = 0.25): PathCommand[] {
  const normalized = normalizePath(commands);
  const command = normalized[commandIndex];
  const previous = previousPoint(normalized, commandIndex);
  if (!command || command.cmd !== "L" || !previous) {
    return normalized;
  }
  const amount = clamp01(softness);
  return normalized.map((item, index) =>
    index === commandIndex
      ? {
          cmd: "C",
          cp1x: previous.x + (command.x - previous.x) * amount,
          cp1y: previous.y + (command.y - previous.y) * amount,
          cp2x: command.x - (command.x - previous.x) * amount,
          cp2y: command.y - (command.y - previous.y) * amount,
          x: command.x,
          y: command.y
        }
      : item
  );
}

function commandPoints(command: PathCommand): Point2D[] {
  if (command.cmd === "M" || command.cmd === "L") {
    return [{ x: command.x, y: command.y }];
  }
  if (command.cmd === "Q") {
    return [
      { x: command.cpx, y: command.cpy },
      { x: command.x, y: command.y }
    ];
  }
  if (command.cmd === "C") {
    return [
      { x: command.cp1x, y: command.cp1y },
      { x: command.cp2x, y: command.cp2y },
      { x: command.x, y: command.y }
    ];
  }
  return [];
}

function previousPoint(commands: readonly PathCommand[], index: number): Point2D | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const command = commands[cursor]!;
    if ("x" in command) {
      return { x: command.x, y: command.y };
    }
  }
  return undefined;
}

function pickNearest(current: PathHit | undefined, candidate: PathHit, tolerance: number): PathHit | undefined {
  if (candidate.distance > tolerance) {
    return current;
  }
  return !current || candidate.distance < current.distance ? candidate : current;
}

function pointToSegmentDistance(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return distance(point, start);
  }
  const t = clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq);
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function distance(left: Point2D, right: Point2D): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
