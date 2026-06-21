import { Assets } from "pixi.js";
import type { PackedTransform2D, RuntimeCompiledRig } from "./types.js";

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
    return normalizeCompiledRig(input);
  }
}

function normalizeCompiledRig(input: RuntimeCompiledRig): RuntimeCompiledRig {
  return {
    ...input,
    rig: {
      ...input.rig,
      bones: input.rig.bones.map((bone) => ({
        ...bone,
        local: toPackedTransform(bone.local)
      })),
      parts: input.rig.parts.map((part) => ({
        ...part,
        local: toPackedTransform(part.local)
      }))
    }
  };
}

function toPackedTransform(transform: PackedTransform2D): PackedTransform2D {
  return (transform instanceof Float32Array ? transform : Float32Array.from(transform)) as unknown as PackedTransform2D;
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
