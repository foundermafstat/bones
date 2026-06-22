import type { PathCommand } from "@bones/schema";
import { importSvgPaths, type PathCommand as VectorPathCommand } from "@bones/vector-core";
import type { EditorProjectState, ShapePart } from "./editorState";

export async function vectorizeSvgParts(
  project: EditorProjectState,
  loadText: (assetPath: string) => Promise<string> = defaultLoadText
): Promise<EditorProjectState> {
  const entries = await Promise.all(
    Object.entries(project.parts).map(async ([partId, part]) => [partId, await vectorizeSvgPart(part, loadText)] as const)
  );
  return { ...project, parts: Object.fromEntries(entries) };
}

export async function vectorizeSvgPart(part: ShapePart, loadText: (assetPath: string) => Promise<string> = defaultLoadText): Promise<ShapePart> {
  if (part.type !== "svg" || !part.assetPath) {
    return part;
  }

  const imported = importSvgPaths(await loadText(part.assetPath));
  if (!imported.paths.length) {
    throw new Error(`SVG asset '${part.assetPath}' does not contain an editable path.`);
  }

  const pathCommands = imported.paths.flatMap((path) => path.commands.map(toSchemaPathCommand));
  return {
    ...part,
    type: "path",
    points: pathToPoints(pathCommands),
    pathCommands,
    ...(imported.viewBox ? { svgViewBox: imported.viewBox } : {})
  };
}

export async function inspectSvgVector(assetPath: string, loadText: (assetPath: string) => Promise<string> = defaultLoadText): Promise<{ readonly pathCount: number; readonly viewBox?: readonly [number, number, number, number] }> {
  const imported = importSvgPaths(await loadText(assetPath));
  return {
    pathCount: imported.paths.length,
    ...(imported.viewBox ? { viewBox: imported.viewBox } : {})
  };
}

async function defaultLoadText(assetPath: string): Promise<string> {
  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`Failed to load SVG asset '${assetPath}': ${response.status}`);
  }
  return response.text();
}

function toSchemaPathCommand(command: VectorPathCommand): PathCommand {
  if (command.cmd === "M" || command.cmd === "L") {
    return { type: command.cmd, x: command.x, y: command.y };
  }
  if (command.cmd === "Q") {
    return { type: "Q", cx: command.cpx, cy: command.cpy, x: command.x, y: command.y };
  }
  if (command.cmd === "C") {
    return {
      type: "C",
      c1x: command.cp1x,
      c1y: command.cp1y,
      c2x: command.cp2x,
      c2y: command.cp2y,
      x: command.x,
      y: command.y
    };
  }
  return { type: "Z" };
}

function pathToPoints(commands: readonly PathCommand[]): readonly (readonly [number, number])[] {
  return commands.flatMap((command) => ("x" in command && "y" in command ? [[command.x, command.y] as const] : []));
}
