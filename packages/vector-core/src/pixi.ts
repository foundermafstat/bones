import type { PathCommand, PixiGraphicsCommand } from "./types.js";
import { normalizePath } from "./path.js";

export function toPixiGraphicsCommands(commands: readonly PathCommand[]): PixiGraphicsCommand[] {
  return normalizePath(commands).map((command) => {
    if (command.cmd === "M") {
      return { method: "moveTo", args: [command.x, command.y] };
    }
    if (command.cmd === "L") {
      return { method: "lineTo", args: [command.x, command.y] };
    }
    if (command.cmd === "Q") {
      return { method: "quadraticCurveTo", args: [command.cpx, command.cpy, command.x, command.y] };
    }
    if (command.cmd === "C") {
      return {
        method: "bezierCurveTo",
        args: [command.cp1x, command.cp1y, command.cp2x, command.cp2y, command.x, command.y]
      };
    }
    return { method: "closePath", args: [] };
  });
}
