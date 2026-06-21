import { parsePathData } from "./path.js";
import type { PathCommand } from "./types.js";

export interface ImportedSvgPath {
  readonly commands: readonly PathCommand[];
  readonly closed: boolean;
  readonly fill?: string;
}

export interface ImportedSvgVector {
  readonly viewBox?: readonly [number, number, number, number];
  readonly paths: readonly ImportedSvgPath[];
}

export function importSvgPaths(source: string): ImportedSvgVector {
  const viewBox = readSvgViewBox(source);
  const paths = readPathTags(source).map((tag) => {
    const pathData = readAttribute(tag, "d") ?? "";
    const commands = parsePathData(decodeXmlEntities(pathData));
    const fill = readAttribute(tag, "fill");
    return {
      commands,
      closed: commands.some((command) => command.cmd === "Z"),
      ...(fill ? { fill } : {})
    };
  });

  return {
    ...(viewBox ? { viewBox } : {}),
    paths
  };
}

function readPathTags(source: string): readonly string[] {
  return [...source.matchAll(/<path\b[^>]*>/gi)].map((match) => match[0]);
}

function readAttribute(tag: string, attribute: string): string | undefined {
  return tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1];
}

function readSvgViewBox(source: string): readonly [number, number, number, number] | undefined {
  const viewBox = source.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  if (viewBox) {
    const values = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number(value));
    if (values.length === 4 && values.every(Number.isFinite)) {
      return [values[0]!, values[1]!, values[2]!, values[3]!];
    }
  }

  const width = readLength(source, "width");
  const height = readLength(source, "height");
  return width && height ? [0, 0, width, height] : undefined;
}

function readLength(source: string, attribute: "width" | "height"): number | undefined {
  const parsed = Number(source.match(new RegExp(`\\b${attribute}=["']([0-9.]+)`, "i"))?.[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
