import { Assets } from "pixi.js";
import type { RuntimeCompiledRig } from "./types.js";

export class RigLoader {
  static async load(source: string | RuntimeCompiledRig): Promise<RuntimeCompiledRig> {
    if (typeof source !== "string") {
      return RigLoader.fromCompiled(source);
    }

    const loaded = await Assets.load(source);
    return RigLoader.fromCompiled(loaded);
  }

  static fromCompiled(input: unknown): RuntimeCompiledRig {
    if (!isCompiledRig(input)) {
      throw new Error("Invalid compiled Bones rig: expected compiled pixi-v8 rig JSON.");
    }
    return input;
  }
}

function isCompiledRig(input: unknown): input is RuntimeCompiledRig {
  if (!isRecord(input)) {
    return false;
  }
  if (input.runtimeTarget !== "pixi-v8" || !isRecord(input.rig)) {
    return false;
  }
  return Array.isArray(input.rig.bones) && Array.isArray(input.rig.parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
