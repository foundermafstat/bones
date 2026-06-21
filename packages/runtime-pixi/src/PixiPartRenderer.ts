import { Graphics, GraphicsContext, Mesh, MeshGeometry, SVGParser, Texture } from "pixi.js";
import {
  createCapsulePath,
  createOrganicBlobPath,
  createTaperedLimbPath,
  toPixiGraphicsCommands,
  type PathCommand
} from "@bones/vector-core";
import type { RuntimeCompiledPart, RuntimePathCommand } from "./types.js";

export interface RenderedPart {
  readonly renderable: Graphics | Mesh<MeshGeometry>;
  readonly graphicsContext?: GraphicsContext;
}

export function createPartRenderable(part: RuntimeCompiledPart): RenderedPart | undefined {
  if (part.type === "mesh" && part.mesh) {
    return { renderable: createMeshRenderable(part) };
  }

  const context = createGraphicsContext(part);
  return context ? { renderable: new Graphics({ context }), graphicsContext: context } : undefined;
}

function createGraphicsContext(part: RuntimeCompiledPart): GraphicsContext | undefined {
  if (part.type === "svg" && part.svg?.source) {
    return SVGParser(part.svg.source);
  }

  const commands = getPathCommands(part);
  if (!commands.length) {
    return undefined;
  }

  const context = new GraphicsContext();
  context.beginPath();
  for (const command of toPixiGraphicsCommands(commands)) {
    if (command.method === "moveTo") {
      context.moveTo(command.args[0], command.args[1]);
    } else if (command.method === "lineTo") {
      context.lineTo(command.args[0], command.args[1]);
    } else if (command.method === "quadraticCurveTo") {
      context.quadraticCurveTo(command.args[0], command.args[1], command.args[2], command.args[3]);
    } else if (command.method === "bezierCurveTo") {
      context.bezierCurveTo(command.args[0], command.args[1], command.args[2], command.args[3], command.args[4], command.args[5]);
    } else {
      context.closePath();
    }
  }

  const fill = part.fill ?? { color: "#050505", alpha: 1 };
  context.fill({ color: fill.color, alpha: fill.alpha });
  return context;
}

function getPathCommands(part: RuntimeCompiledPart): readonly PathCommand[] {
  if (part.path?.commands) {
    return part.path.commands.map(toVectorPathCommand).filter((command): command is PathCommand => Boolean(command));
  }

  if (!part.procedural) {
    return [];
  }

  const params = part.procedural.params;
  if (part.procedural.preset === "tapered-limb") {
    return createTaperedLimbPath({
      length: numberParam(params, "length", 32),
      startWidth: numberParam(params, "startWidth", 9),
      endWidth: numberParam(params, "endWidth", 5),
      bend: numberParam(params, "bend", 0),
      softness: numberParam(params, "softness", 0.65)
    });
  }
  if (part.procedural.preset === "organic-blob" || part.procedural.preset === "circle") {
    const radius = numberParam(params, "radius", 12);
    return createOrganicBlobPath({
      radiusX: numberParam(params, "radiusX", radius),
      radiusY: numberParam(params, "radiusY", radius),
      asymmetry: numberParam(params, "asymmetry", 0)
    });
  }
  if (part.procedural.preset === "capsule") {
    return createCapsulePath(numberParam(params, "length", 32), numberParam(params, "radius", 5));
  }
  if (part.procedural.preset === "rect") {
    const width = numberParam(params, "width", 16);
    const height = numberParam(params, "height", 16);
    return [
      { cmd: "M", x: 0, y: 0 },
      { cmd: "L", x: width, y: 0 },
      { cmd: "L", x: width, y: height },
      { cmd: "L", x: 0, y: height },
      { cmd: "Z" }
    ];
  }
  return [];
}

function createMeshRenderable(part: RuntimeCompiledPart): Mesh<MeshGeometry> {
  if (!part.mesh) {
    throw new Error(`Mesh part '${part.id}' is missing mesh data.`);
  }
  const geometry = new MeshGeometry({
    positions: new Float32Array(part.mesh.vertices),
    uvs: new Float32Array(part.mesh.vertices.length),
    indices: new Uint32Array(part.mesh.indices)
  });
  const renderable = new Mesh({ geometry, texture: Texture.WHITE });
  (renderable as Mesh<MeshGeometry> & { tint?: string | number }).tint = part.fill?.color ?? "#050505";
  return renderable;
}

function toVectorPathCommand(command: RuntimePathCommand): PathCommand | undefined {
  const type = "cmd" in command ? command.cmd : command.type;
  if ((type === "M" || type === "L") && "x" in command) {
    return { cmd: type, x: command.x, y: command.y };
  }
  if (type === "Q" && "x" in command) {
    return {
      cmd: "Q",
      cpx: getNumber(command, "cpx", "c1x"),
      cpy: getNumber(command, "cpy", "c1y"),
      x: command.x,
      y: command.y
    };
  }
  if (type === "C" && "x" in command) {
    return {
      cmd: "C",
      cp1x: getNumber(command, "cp1x", "c1x"),
      cp1y: getNumber(command, "cp1y", "c1y"),
      cp2x: getNumber(command, "cp2x", "c2x"),
      cp2y: getNumber(command, "cp2y", "c2y"),
      x: command.x,
      y: command.y
    };
  }
  return type === "Z" ? { cmd: "Z" } : undefined;
}

function numberParam(params: Readonly<Record<string, string | number | boolean>>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getNumber(command: RuntimePathCommand, primary: string, fallback: string): number {
  const values = command as unknown as Readonly<Record<string, unknown>>;
  const primaryValue = values[primary];
  if (typeof primaryValue === "number") {
    return primaryValue;
  }
  const fallbackValue = values[fallback];
  return typeof fallbackValue === "number" ? fallbackValue : 0;
}
