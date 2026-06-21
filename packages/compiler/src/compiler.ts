import {
  assertRigProject,
  SchemaValidationError,
  validateRigProject,
  type AnimationClip,
  type AnimationStateMachine,
  type AnimationTrack,
  type JsonValue,
  type Keyframe,
  type RigDefinition,
  type RigProject,
  type Transform2D
} from "@bones/schema";
import { BONES_COMPILED_FORMAT_VERSION, type CompileOptions, type CompiledAnimationClipV1, type CompiledAnimationTrackV1, type CompiledKeyframeV1, type CompiledLookupTablesV1, type CompiledPartV1, type CompiledRigProjectV1, type CompiledStateMachineV1, type CompiledStateV1, type PackedTransform2D } from "./types.js";

const identityTransform: Transform2D = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1
};

const defaultBezier: readonly [number, number, number, number] = [0, 0, 1, 1];

export function validateProject(project: unknown): RigProject {
  return assertRigProject(project);
}

export function compileRig(projectInput: unknown, options: CompileOptions = {}): CompiledRigProjectV1 {
  const project = validateProject(projectInput);
  const rig = selectRig(project, options.rigId);
  const lookups = buildLookupTables(project, rig);
  const defaultFrameRate = options.defaultFrameRate ?? 60;

  return {
    compiledFormatVersion: BONES_COMPILED_FORMAT_VERSION,
    schemaVersion: project.schemaVersion,
    runtimeTarget: project.runtimeTarget,
    sourceProjectId: project.id,
    name: project.name,
    rig: {
      id: lookupRequired(lookups.rigs, rig.id, "rig"),
      rootBone: lookupRequired(lookups.bones, rig.rootBoneId, "bone"),
      bones: rig.bones.map((bone) => ({
        id: lookupRequired(lookups.bones, bone.id, "bone"),
        parent: bone.parentId ? lookupRequired(lookups.bones, bone.parentId, "bone") : -1,
        local: packTransform(bone.local ?? bone.transform ?? identityTransform),
        length: bone.length ?? 0
      })),
      parts: (rig.parts ?? []).map((part) => {
        const compiled: CompiledPartV1 = {
          id: lookupRequired(lookups.parts, part.id, "part"),
          bone: lookupRequired(lookups.bones, part.boneId, "bone"),
          type: part.type,
          drawOrder: part.drawOrder ?? 0,
          visible: part.visible ?? true,
          opacity: part.opacity ?? 1,
          local: packTransform(part.local ?? part.transform ?? identityTransform),
          ...(part.fill ? { fill: { color: part.fill.color, alpha: part.fill.alpha ?? 1 } } : {}),
          ...(part.path
            ? { path: { closed: part.path.closed ?? false, commands: part.path.commands as unknown as readonly JsonValue[] } }
            : {}),
          ...(part.procedural
            ? { procedural: { preset: part.procedural.preset, params: part.procedural.params ?? {} } }
            : {}),
          ...(part.mesh ? { mesh: { vertices: [...part.mesh.vertices], indices: [...part.mesh.indices] } } : {}),
          ...(part.svg
            ? {
                svg: {
                  source: part.svg.source,
                  ...(part.svg.viewBox ? { viewBox: part.svg.viewBox } : {})
                }
              }
            : {})
        };
        return compiled;
      })
    },
    animations: (project.animations ?? []).map((clip) => compileAnimationClip(clip, lookups, defaultFrameRate)),
    stateMachines: (project.stateMachines ?? []).map((machine) => compileStateMachine(machine, lookups)),
    lookups
  };
}

export function buildLookupTables(project: RigProject, rig: RigDefinition = selectRig(project)): CompiledLookupTablesV1 {
  return {
    rigs: makeLookup(project.rigs.map((item) => item.id)),
    bones: makeLookup(rig.bones.map((item) => item.id)),
    parts: makeLookup((rig.parts ?? []).map((item) => item.id)),
    animations: makeLookup((project.animations ?? []).map((item) => item.id)),
    stateMachines: makeLookup((project.stateMachines ?? []).map((item) => item.id))
  };
}

export function flattenKeyframes(keyframes: readonly Keyframe[]): readonly CompiledKeyframeV1[] {
  return keyframes.map((keyframe) => ({
    time: keyframe.time,
    value: keyframe.value,
    interpolation: keyframe.interpolation ?? "linear",
    curve: optimizeCurves(keyframe.curve, keyframe.interpolation)
  }));
}

export function optimizeCurves(
  curve: readonly [number, number, number, number] | undefined,
  interpolation: Keyframe["interpolation"] = "linear"
): readonly [number, number, number, number] {
  if (interpolation !== "bezier") {
    return defaultBezier;
  }
  return curve ? [curve[0], curve[1], curve[2], curve[3]] : [0.25, 0.1, 0.25, 1];
}

function compileAnimationClip(
  clip: AnimationClip,
  lookups: CompiledLookupTablesV1,
  defaultFrameRate: number
): CompiledAnimationClipV1 {
  const trackLookup = makeLookup(clip.tracks.map((track) => track.id));
  return {
    id: lookupRequired(lookups.animations, clip.id, "animation"),
    duration: clip.duration,
    fps: clip.fps ?? defaultFrameRate,
    loop: clip.loop ?? false,
    tracks: clip.tracks.map((track) => compileTrack(track, trackLookup, lookups)),
    trackLookup
  };
}

function compileTrack(
  track: AnimationTrack,
  trackLookup: Readonly<Record<string, number>>,
  lookups: CompiledLookupTablesV1
): CompiledAnimationTrackV1 {
  return {
    id: lookupRequired(trackLookup, track.id, "track"),
    targetKind: track.target.kind,
    target: compileTrackTarget(track, lookups),
    property: track.property,
    keyframes: flattenKeyframes(track.keyframes)
  };
}

function compileTrackTarget(track: AnimationTrack, lookups: CompiledLookupTablesV1): number {
  if (track.target.kind === "bone") {
    return lookupRequired(lookups.bones, track.target.id, "bone");
  }
  if (track.target.kind === "part") {
    return lookupRequired(lookups.parts, track.target.id, "part");
  }
  if (track.target.kind === "stateMachine") {
    return lookupRequired(lookups.stateMachines, track.target.id, "stateMachine");
  }
  return 0;
}

function compileStateMachine(
  machine: AnimationStateMachine,
  lookups: CompiledLookupTablesV1
): CompiledStateMachineV1 {
  const stateLookup = makeLookup(machine.states.map((state) => state.id));
  const parameterLookup = makeLookup((machine.parameters ?? []).map((parameter) => parameter.id));
  const compiledStates = machine.states.map((state) => {
    const compiled: CompiledStateV1 = {
      id: lookupRequired(stateLookup, state.id, "state"),
      clip: state.clipId ? lookupRequired(lookups.animations, state.clipId, "animation") : -1,
      ...(state.blendTree
        ? {
            blendTree: {
              type: state.blendTree.type,
              parameter: lookupRequired(parameterLookup, state.blendTree.parameter, "parameter"),
              children: state.blendTree.children.map((child) => ({
                threshold: child.threshold,
                clip: lookupRequired(lookups.animations, child.clipId, "animation")
              }))
            }
          }
        : {})
    };
    return compiled;
  });

  return {
    id: lookupRequired(lookups.stateMachines, machine.id, "stateMachine"),
    initialState: lookupRequired(stateLookup, machine.initialStateId, "state"),
    states: compiledStates,
    transitions: (machine.transitions ?? []).map((transition, index) => ({
      id: index,
      from: lookupRequired(stateLookup, transition.fromStateId, "state"),
      to: lookupRequired(stateLookup, transition.toStateId, "state"),
      duration: transition.duration,
      priority: transition.priority ?? 0,
      canInterrupt: transition.canInterrupt ?? true,
      conditions: (transition.conditions ?? []).map((condition) => ({
        parameter: lookupRequired(parameterLookup, condition.parameterId, "parameter"),
        operator: condition.operator,
        value: condition.value
      }))
    })),
    parameters: (machine.parameters ?? []).map((parameter) => ({
      id: lookupRequired(parameterLookup, parameter.id, "parameter"),
      type: parameter.type,
      defaultValue: parameter.defaultValue
    })),
    stateLookup,
    parameterLookup
  };
}

function selectRig(project: RigProject, rigId?: string): RigDefinition {
  const rig = rigId ? project.rigs.find((item) => item.id === rigId) : project.rigs[0];
  if (!rig) {
    throw new Error(rigId ? `Rig '${rigId}' was not found.` : "Project does not contain a rig.");
  }
  return rig;
}

function packTransform(transform: Transform2D): PackedTransform2D {
  return [
    transform.x,
    transform.y,
    transform.rotation,
    transform.scaleX,
    transform.scaleY,
    transform.skewX ?? 0,
    transform.skewY ?? 0
  ];
}

function makeLookup(ids: readonly string[]): Readonly<Record<string, number>> {
  return Object.fromEntries(ids.map((id, index) => [id, index]));
}

function lookupRequired(lookup: Readonly<Record<string, number>>, id: string, label: string): number {
  const value = lookup[id];
  if (value === undefined) {
    throw new Error(`Compiled ${label} lookup is missing '${id}'.`);
  }
  return value;
}

export { SchemaValidationError, validateRigProject };
