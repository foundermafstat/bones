import type { OrganicBlobOptions, PathCommand, ProceduralTaperedLimbOptions, SvgPathSource } from "./types.js";
import { closePath } from "./path.js";

export function createTaperedLimbPath(options: ProceduralTaperedLimbOptions): PathCommand[] {
  const length = positive(options.length, "length");
  const startHalf = positive(options.startWidth, "startWidth") / 2;
  const endHalf = positive(options.endWidth, "endWidth") / 2;
  const softness = clamp(options.softness ?? 0.65, 0, 1);
  const bend = options.bend ?? 0;
  const cp = length * (0.25 + softness * 0.25);
  const bendOffset = length * bend;

  return closePath([
    { cmd: "M", x: 0, y: -startHalf },
    { cmd: "C", cp1x: cp, cp1y: -startHalf - bendOffset, cp2x: length - cp, cp2y: -endHalf - bendOffset, x: length, y: -endHalf },
    { cmd: "C", cp1x: length + endHalf * softness, cp1y: -endHalf * 0.2, cp2x: length + endHalf * softness, cp2y: endHalf * 0.8, x: length, y: endHalf },
    { cmd: "C", cp1x: length - cp, cp1y: endHalf + bendOffset, cp2x: cp, cp2y: startHalf + bendOffset, x: 0, y: startHalf }
  ]);
}

export function createOrganicBlobPath(options: OrganicBlobOptions): PathCommand[] {
  const radiusX = positive(options.radiusX, "radiusX");
  const radiusY = positive(options.radiusY, "radiusY");
  const asymmetry = clamp(options.asymmetry ?? 0.12, -0.8, 0.8);
  const k = 0.5522847498;

  return closePath([
    { cmd: "M", x: 0, y: -radiusY },
    {
      cmd: "C",
      cp1x: radiusX * k * (1 + asymmetry),
      cp1y: -radiusY,
      cp2x: radiusX,
      cp2y: -radiusY * k,
      x: radiusX,
      y: 0
    },
    {
      cmd: "C",
      cp1x: radiusX,
      cp1y: radiusY * k,
      cp2x: radiusX * k * (1 - asymmetry),
      cp2y: radiusY,
      x: 0,
      y: radiusY
    },
    {
      cmd: "C",
      cp1x: -radiusX * k * (0.9 - asymmetry),
      cp1y: radiusY,
      cp2x: -radiusX,
      cp2y: radiusY * k,
      x: -radiusX,
      y: 0
    },
    {
      cmd: "C",
      cp1x: -radiusX,
      cp1y: -radiusY * k,
      cp2x: -radiusX * k * (1 + asymmetry),
      cp2y: -radiusY,
      x: 0,
      y: -radiusY
    }
  ]);
}

export function createCapsulePath(length: number, radius: number): PathCommand[] {
  const safeLength = positive(length, "length");
  const safeRadius = positive(radius, "radius");
  return createTaperedLimbPath({
    length: safeLength,
    startWidth: safeRadius * 2,
    endWidth: safeRadius * 2,
    softness: 1
  });
}

export function createSvgPathSource(source: string, viewBox?: readonly [number, number, number, number]): SvgPathSource {
  if (source.length === 0) {
    throw new Error("SVG source must be non-empty.");
  }
  return viewBox ? { type: "svg", source, viewBox } : { type: "svg", source };
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
