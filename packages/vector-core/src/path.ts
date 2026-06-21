import type { PathCommand, PathDirection, Point2D, VectorPath } from "./types.js";

const commandArity = {
  M: 2,
  L: 2,
  Q: 4,
  C: 6,
  Z: 0
} as const;

type DrawCommand = Exclude<PathCommand, { readonly cmd: "M" | "Z" }>;

export function parsePathData(pathData: string): PathCommand[] {
  const tokens = pathData.match(/[MLQCZmlqcz]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) {
    return [];
  }

  const commands: PathCommand[] = [];
  let index = 0;
  let activeCommand: keyof typeof commandArity | undefined;
  let current: Point2D = { x: 0, y: 0 };
  let subpathStart: Point2D = { x: 0, y: 0 };

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }

    const commandToken = isCommandToken(token) ? token : undefined;
    if (commandToken) {
      activeCommand = commandToken.toUpperCase() as keyof typeof commandArity;
      index += 1;
    }

    if (!activeCommand) {
      throw new Error(`Path data must start with a command. Found '${token}'.`);
    }

    if (activeCommand === "Z") {
      commands.push({ cmd: "Z" });
      current = subpathStart;
      activeCommand = undefined;
      continue;
    }

    const relative = commandToken !== undefined && commandToken === commandToken.toLowerCase();
    const arity = commandArity[activeCommand];
    const values = readNumbers(tokens, index, arity, activeCommand);
    index += arity;

    if (activeCommand === "M") {
      const [x, y] = values as [number, number];
      current = point(x, y, relative ? current : undefined);
      subpathStart = current;
      commands.push({ cmd: "M", ...current });
      activeCommand = "L";
      continue;
    }

    if (activeCommand === "L") {
      const [x, y] = values as [number, number];
      current = point(x, y, relative ? current : undefined);
      commands.push({ cmd: "L", ...current });
      continue;
    }

    if (activeCommand === "Q") {
      const [cpx, cpy, x, y] = values as [number, number, number, number];
      const control = point(cpx, cpy, relative ? current : undefined);
      current = point(x, y, relative ? current : undefined);
      commands.push({ cmd: "Q", cpx: control.x, cpy: control.y, x: current.x, y: current.y });
      continue;
    }

    if (activeCommand === "C") {
      const [cp1x, cp1y, cp2x, cp2y, x, y] = values as [number, number, number, number, number, number];
      const cp1 = point(cp1x, cp1y, relative ? current : undefined);
      const cp2 = point(cp2x, cp2y, relative ? current : undefined);
      current = point(x, y, relative ? current : undefined);
      commands.push({ cmd: "C", cp1x: cp1.x, cp1y: cp1.y, cp2x: cp2.x, cp2y: cp2.y, x: current.x, y: current.y });
    }
  }

  return normalizePath(commands);
}

export function normalizePath(commands: readonly PathCommand[]): PathCommand[] {
  const normalized: PathCommand[] = [];
  let hasMove = false;

  for (const command of commands) {
    if (command.cmd === "M") {
      if (!hasMove) {
        normalized.push({ cmd: "M", x: cleanNumber(command.x), y: cleanNumber(command.y) });
        hasMove = true;
      } else {
        normalized.push({ cmd: "M", x: cleanNumber(command.x), y: cleanNumber(command.y) });
      }
      continue;
    }

    if (!hasMove) {
      throw new Error("Path must start with an M command.");
    }

    if (command.cmd === "L") {
      normalized.push({ cmd: "L", x: cleanNumber(command.x), y: cleanNumber(command.y) });
    } else if (command.cmd === "Q") {
      normalized.push({
        cmd: "Q",
        cpx: cleanNumber(command.cpx),
        cpy: cleanNumber(command.cpy),
        x: cleanNumber(command.x),
        y: cleanNumber(command.y)
      });
    } else if (command.cmd === "C") {
      normalized.push({
        cmd: "C",
        cp1x: cleanNumber(command.cp1x),
        cp1y: cleanNumber(command.cp1y),
        cp2x: cleanNumber(command.cp2x),
        cp2y: cleanNumber(command.cp2y),
        x: cleanNumber(command.x),
        y: cleanNumber(command.y)
      });
    } else if (normalized.at(-1)?.cmd !== "Z") {
      normalized.push({ cmd: "Z" });
    }
  }

  return normalized;
}

export function createVectorPath(commands: readonly PathCommand[]): VectorPath {
  const normalized = normalizePath(commands);
  return {
    commands: normalized,
    closed: isPathClosed(normalized)
  };
}

export function isPathClosed(commands: readonly PathCommand[]): boolean {
  if (commands.at(-1)?.cmd === "Z") {
    return true;
  }

  const start = getStartPoint(commands);
  const end = getEndPoint(commands);
  return start !== undefined && end !== undefined && samePoint(start, end);
}

export function closePath(commands: readonly PathCommand[]): PathCommand[] {
  const normalized = normalizePath(commands);
  return isPathClosed(normalized) ? normalized : [...normalized, { cmd: "Z" }];
}

export function openPath(commands: readonly PathCommand[]): PathCommand[] {
  return normalizePath(commands).filter((command) => command.cmd !== "Z");
}

export function mirrorPath(
  commands: readonly PathCommand[],
  axis: "x" | "y",
  origin = 0
): PathCommand[] {
  return normalizePath(commands).map((command) => mapCommandPoints(command, (pointValue) => mirrorPoint(pointValue, axis, origin)));
}

export function reversePath(commands: readonly PathCommand[]): PathCommand[] {
  const normalized = normalizePath(commands);
  const segments = toSegments(normalized);
  if (segments.length === 0) {
    return normalized;
  }

  const closed = isPathClosed(normalized);
  const start = closed ? getStartPoint(normalized) : segments.at(-1)?.to;
  if (!start) {
    return normalized;
  }

  const reversed: PathCommand[] = [{ cmd: "M", x: start.x, y: start.y }];
  for (const segment of [...segments].reverse()) {
    if (segment.command.cmd === "Z") {
      reversed.push({ cmd: "L", x: segment.from.x, y: segment.from.y });
    } else if (segment.command.cmd === "L") {
      reversed.push({ cmd: "L", x: segment.from.x, y: segment.from.y });
    } else if (segment.command.cmd === "Q") {
      reversed.push({ cmd: "Q", cpx: segment.command.cpx, cpy: segment.command.cpy, x: segment.from.x, y: segment.from.y });
    } else {
      reversed.push({
        cmd: "C",
        cp1x: segment.command.cp2x,
        cp1y: segment.command.cp2y,
        cp2x: segment.command.cp1x,
        cp2y: segment.command.cp1y,
        x: segment.from.x,
        y: segment.from.y
      });
    }
  }

  return closed ? closePath(removeClosingLine(reversed)) : normalizedWithoutDuplicateMove(reversed);
}

export function getPathDirection(commands: readonly PathCommand[]): PathDirection {
  const area = signedArea(commands);
  if (Math.abs(area) < Number.EPSILON) {
    return "flat";
  }
  return area > 0 ? "counterclockwise" : "clockwise";
}

export function normalizePathDirection(
  commands: readonly PathCommand[],
  direction: Exclude<PathDirection, "flat">
): PathCommand[] {
  const current = getPathDirection(commands);
  if (current === "flat" || current === direction) {
    return normalizePath(commands);
  }
  return reversePath(commands);
}

export function simplifyPath(commands: readonly PathCommand[], epsilon = 0.000001): PathCommand[] {
  const normalized = normalizePath(commands);
  const simplified: PathCommand[] = [];
  let previousPoint: Point2D | undefined;

  for (const command of normalized) {
    if (command.cmd === "M") {
      simplified.push(command);
      previousPoint = command;
      continue;
    }

    if (command.cmd === "L") {
      if (previousPoint && distance(previousPoint, command) <= epsilon) {
        continue;
      }
      const previousCommand = simplified.at(-1);
      const beforePrevious = simplified.at(-2);
      if (previousCommand?.cmd === "L" && beforePrevious && hasPoint(beforePrevious) && isCollinear(beforePrevious, previousCommand, command, epsilon)) {
        simplified[simplified.length - 1] = command;
      } else {
        simplified.push(command);
      }
      previousPoint = command;
      continue;
    }

    simplified.push(command);
    if (hasPoint(command)) {
      previousPoint = command;
    }
  }

  return normalizePath(simplified);
}

export function smoothPath(commands: readonly PathCommand[], factor = 0.2): PathCommand[] {
  const normalized = normalizePath(commands);
  const clamped = Math.max(0, Math.min(0.45, factor));
  if (clamped === 0 || normalized.some((command) => command.cmd === "Q" || command.cmd === "C")) {
    return normalized;
  }

  const closed = isPathClosed(normalized);
  const points = normalized.filter(hasPoint);
  if (points.length < 3) {
    return normalized;
  }

  const first = points[0];
  if (!first) {
    return normalized;
  }
  const smoothed: PathCommand[] = [{ cmd: "M", x: first.x, y: first.y }];
  const end = closed ? points.length : points.length - 1;

  for (let index = 1; index < end; index += 1) {
    const prev = points[index - 1] ?? points.at(-1);
    const current = points[index % points.length];
    const next = points[(index + 1) % points.length];
    if (!prev || !current || !next) {
      continue;
    }
    const entry = lerpPoint(current, prev, clamped);
    const exit = lerpPoint(current, next, clamped);
    smoothed.push({ cmd: "L", ...entry });
    smoothed.push({ cmd: "Q", cpx: current.x, cpy: current.y, ...exit });
  }

  if (closed) {
    return closePath(smoothed);
  }

  const last = points.at(-1);
  return last ? [...smoothed, { cmd: "L", x: last.x, y: last.y }] : smoothed;
}

export function serializePathData(commands: readonly PathCommand[]): string {
  return normalizePath(commands)
    .map((command) => {
      if (command.cmd === "M" || command.cmd === "L") {
        return `${command.cmd} ${formatNumber(command.x)} ${formatNumber(command.y)}`;
      }
      if (command.cmd === "Q") {
        return `Q ${formatNumber(command.cpx)} ${formatNumber(command.cpy)} ${formatNumber(command.x)} ${formatNumber(command.y)}`;
      }
      if (command.cmd === "C") {
        return `C ${formatNumber(command.cp1x)} ${formatNumber(command.cp1y)} ${formatNumber(command.cp2x)} ${formatNumber(command.cp2y)} ${formatNumber(command.x)} ${formatNumber(command.y)}`;
      }
      return "Z";
    })
    .join(" ");
}

export function signedArea(commands: readonly PathCommand[]): number {
  const points = normalizePath(commands).filter(hasPoint);
  if (points.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) {
      sum += current.x * next.y - next.x * current.y;
    }
  }
  return sum / 2;
}

function readNumbers(tokens: readonly string[], start: number, count: number, command: string): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const token = tokens[start + offset];
    if (token === undefined || isCommandToken(token)) {
      throw new Error(`Command ${command} expects ${count} numeric values.`);
    }
    values.push(Number(token));
  }
  return values;
}

function point(x: number, y: number, relativeTo?: Point2D): Point2D {
  return relativeTo ? { x: relativeTo.x + x, y: relativeTo.y + y } : { x, y };
}

function isCommandToken(token: string): boolean {
  return /^[MLQCZmlqcz]$/.test(token);
}

function getStartPoint(commands: readonly PathCommand[]): Point2D | undefined {
  const first = commands.find((command) => command.cmd === "M");
  return first && first.cmd === "M" ? { x: first.x, y: first.y } : undefined;
}

function getEndPoint(commands: readonly PathCommand[]): Point2D | undefined {
  return normalizePath(commands).filter(hasPoint).at(-1);
}

function hasPoint(command: PathCommand): command is Extract<PathCommand, { readonly x: number; readonly y: number }> {
  return "x" in command && "y" in command;
}

function samePoint(a: Point2D, b: Point2D): boolean {
  return a.x === b.x && a.y === b.y;
}

function mapCommandPoints(command: PathCommand, mapper: (point: Point2D) => Point2D): PathCommand {
  if (command.cmd === "M" || command.cmd === "L") {
    return { cmd: command.cmd, ...mapper(command) };
  }
  if (command.cmd === "Q") {
    const control = mapper({ x: command.cpx, y: command.cpy });
    const end = mapper(command);
    return { cmd: "Q", cpx: control.x, cpy: control.y, ...end };
  }
  if (command.cmd === "C") {
    const cp1 = mapper({ x: command.cp1x, y: command.cp1y });
    const cp2 = mapper({ x: command.cp2x, y: command.cp2y });
    const end = mapper(command);
    return { cmd: "C", cp1x: cp1.x, cp1y: cp1.y, cp2x: cp2.x, cp2y: cp2.y, ...end };
  }
  return command;
}

function mirrorPoint(pointValue: Point2D, axis: "x" | "y", origin: number): Point2D {
  return axis === "x"
    ? { x: pointValue.x, y: origin * 2 - pointValue.y }
    : { x: origin * 2 - pointValue.x, y: pointValue.y };
}

function toSegments(commands: readonly PathCommand[]): Array<{ readonly from: Point2D; readonly to: Point2D; readonly command: DrawCommand | { readonly cmd: "Z" } }> {
  const normalized = normalizePath(commands);
  const segments: Array<{ readonly from: Point2D; readonly to: Point2D; readonly command: DrawCommand | { readonly cmd: "Z" } }> = [];
  let start: Point2D | undefined;
  let current: Point2D | undefined;

  for (const command of normalized) {
    if (command.cmd === "M") {
      start = command;
      current = command;
      continue;
    }
    if (!current) {
      continue;
    }
    if (command.cmd === "Z") {
      if (start) {
        segments.push({ from: current, to: start, command });
        current = start;
      }
      continue;
    }
    segments.push({ from: current, to: command, command });
    current = command;
  }

  return segments;
}

function removeClosingLine(commands: readonly PathCommand[]): PathCommand[] {
  const start = getStartPoint(commands);
  if (!start) {
    return [...commands];
  }
  const copy = [...commands];
  const last = copy.at(-1);
  if (last && hasPoint(last) && samePoint(last, start)) {
    copy.pop();
  }
  return copy;
}

function normalizedWithoutDuplicateMove(commands: readonly PathCommand[]): PathCommand[] {
  return normalizePath(commands).filter((command, index) => index === 0 || command.cmd !== "M");
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isCollinear(a: Point2D, b: Point2D, c: Point2D, epsilon: number): boolean {
  return Math.abs((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)) <= epsilon;
}

function lerpPoint(a: Point2D, b: Point2D, amount: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount
  };
}

function cleanNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Path command coordinates must be finite numbers.");
  }
  return Object.is(value, -0) ? 0 : value;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}
