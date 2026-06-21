import {
  assertRigProject,
  SchemaValidationError,
  validateRigProject,
  type AnimationClip,
  type AnimationCondition,
  type AnimationEvent,
  type AnimationStateMachine,
  type AnimationTransition,
  type AnimationTrack,
  type JsonValue,
  type Keyframe,
  type PartDefinition,
  type RigDefinition,
  type RigProject,
  type Transform2D
} from "@bones/schema";
import {
  BONES_COMPILED_FORMAT_VERSION,
  type CompileIssue,
  type CompileOptions,
  type CompiledAnimationClipV1,
  type CompiledAnimationTrackV1,
  type CompiledKeyframeV1,
  type CompiledLookupTablesV1,
  type CompiledPartV1,
  type CompiledRigProjectV1,
  type CompiledStateMachineV1,
  type CompiledStateV1,
  type PackedTransform2D
} from "./types.js";

const identityTransform: Transform2D = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1
};

const defaultBezier: readonly [number, number, number, number] = [0, 0, 1, 1];

export class CompileError extends Error {
  readonly issues: readonly CompileIssue[];

  constructor(message: string, issues: readonly CompileIssue[]) {
    super(`${message}\n${issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
    this.name = "CompileError";
    this.issues = issues;
  }
}

export function validateProject(project: unknown): RigProject {
  return assertRigProject(project);
}

export function compileRig(projectInput: unknown, options: CompileOptions = {}): CompiledRigProjectV1 {
  const project = validateProjectForCompile(projectInput);
  const rig = selectRig(project, options.rigId);
  const normalized = normalizeForCompile(project, rig);
  const lookups = buildLookupTables(project, rig);
  const defaultFrameRate = options.defaultFrameRate ?? project.defaultFrameRate ?? 60;

  return {
    compiledFormatVersion: BONES_COMPILED_FORMAT_VERSION,
    schemaVersion: project.schemaVersion,
    runtimeTarget: project.runtimeTarget,
    sourceProjectId: project.id,
    name: project.name,
    rig: {
      id: lookupRequired(lookups.rigs, rig.id, "rig"),
      rootBone: lookupRequired(lookups.bones, rig.rootBoneId, "bone"),
      bones: normalized.bones.map((bone) => ({
        id: lookupRequired(lookups.bones, bone.id, "bone"),
        parent: bone.parentId ? lookupRequired(lookups.bones, bone.parentId, "bone") : -1,
        local: packTransform(bone.local ?? bone.transform ?? identityTransform),
        length: bone.length ?? 0
      })),
      parts: normalized.parts.map((part) => {
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
    animations: normalized.animations.map((clip) => compileAnimationClip(clip, lookups, defaultFrameRate)),
    stateMachines: normalized.stateMachines.map((machine) => compileStateMachine(machine, lookups)),
    lookups
  };
}

export function buildLookupTables(project: RigProject, rig: RigDefinition = selectRig(project)): CompiledLookupTablesV1 {
  const normalized = normalizeForCompile(project, rig);
  return {
    rigs: makeLookup(sortById(project.rigs).map((item) => item.id)),
    bones: makeLookup(normalized.bones.map((item) => item.id)),
    parts: makeLookup(normalized.parts.map((item) => item.id)),
    animations: makeLookup(normalized.animations.map((item) => item.id)),
    stateMachines: makeLookup(normalized.stateMachines.map((item) => item.id))
  };
}

export function flattenKeyframes(keyframes: readonly Keyframe[]): readonly CompiledKeyframeV1[] {
  return sortKeyframes(keyframes).map((keyframe) => ({
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
  const tracks = sortById(clip.tracks);
  const trackLookup = makeLookup(tracks.map((track) => track.id));
  return {
    id: lookupRequired(lookups.animations, clip.id, "animation"),
    duration: clip.duration,
    fps: clip.fps ?? clip.frameRate ?? defaultFrameRate,
    loop: clip.loop ?? false,
    tracks: tracks.map((track) => compileTrack(track, trackLookup, lookups)),
    trackLookup,
    events: sortEvents(clip.events ?? []).map((event) => ({
      time: event.time,
      type: event.type,
      ...(event.payload ? { payload: event.payload as unknown as JsonValue } : {})
    }))
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
  const states = sortById(machine.states);
  const parameters = sortById(machine.parameters ?? []);
  const transitions = sortTransitions(machine.transitions ?? []);
  const stateLookup = makeLookup(states.map((state) => state.id));
  const parameterLookup = makeLookup(parameters.map((parameter) => parameter.id));
  const compiledStates = states.map((state) => {
    const compiled: CompiledStateV1 = {
      id: lookupRequired(stateLookup, state.id, "state"),
      clip: state.clipId ? lookupRequired(lookups.animations, state.clipId, "animation") : -1,
      ...(state.blendTree
        ? {
            blendTree: {
              type: state.blendTree.type,
              parameter: lookupRequired(parameterLookup, state.blendTree.parameter, "parameter"),
              children: [...state.blendTree.children]
                .sort((left, right) => left.threshold - right.threshold)
                .map((child) => ({
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
    transitions: transitions.map((transition, index) => ({
      id: index,
      from: lookupRequired(stateLookup, transition.fromStateId, "state"),
      to: lookupRequired(stateLookup, transition.toStateId, "state"),
      duration: transition.duration,
      easing: transition.easing ?? "linear",
      priority: transition.priority ?? 0,
      canInterrupt: transition.canInterrupt ?? true,
      syncMode: transition.syncMode ?? "none",
      conditions: sortConditions(transition.conditions ?? []).map((condition) => ({
        parameter: lookupRequired(parameterLookup, condition.parameterId, "parameter"),
        operator: condition.operator,
        value: condition.value
      }))
    })),
    parameters: parameters.map((parameter) => ({
      id: lookupRequired(parameterLookup, parameter.id, "parameter"),
      type: parameter.type,
      defaultValue: parameter.defaultValue
    })),
    stateLookup,
    parameterLookup
  };
}

function validateProjectForCompile(input: unknown): RigProject {
  const result = validateRigProject(input);
  if (result.ok) {
    return result.value;
  }
  throw new CompileError("Cannot compile invalid Bones source project.", result.errors);
}

function selectRig(project: RigProject, rigId?: string): RigDefinition {
  const rigs = sortById(project.rigs);
  const rig = rigId ? rigs.find((item) => item.id === rigId) : rigs[0];
  if (!rig) {
    throw new Error(rigId ? `Rig '${rigId}' was not found.` : "Project does not contain a rig.");
  }
  return rig;
}

interface NormalizedCompileInput {
  readonly bones: readonly RigDefinition["bones"][number][];
  readonly parts: readonly PartDefinition[];
  readonly animations: readonly AnimationClip[];
  readonly stateMachines: readonly AnimationStateMachine[];
}

function normalizeForCompile(project: RigProject, rig: RigDefinition): NormalizedCompileInput {
  return {
    bones: sortBonesTopologically(rig),
    parts: sortParts(rig.parts ?? []),
    animations: sortById(project.animations ?? []),
    stateMachines: sortById(project.stateMachines ?? [])
  };
}

function sortBonesTopologically(rig: RigDefinition): readonly RigDefinition["bones"][number][] {
  const children = new Map<string, readonly RigDefinition["bones"][number][]>();
  for (const bone of rig.bones) {
    const parentId = bone.parentId ?? "";
    children.set(parentId, [...(children.get(parentId) ?? []), bone]);
  }

  for (const [parentId, parentChildren] of children) {
    children.set(parentId, sortById(parentChildren));
  }

  const sorted: RigDefinition["bones"][number][] = [];
  const visit = (bone: RigDefinition["bones"][number]) => {
    sorted.push(bone);
    for (const child of children.get(bone.id) ?? []) {
      visit(child);
    }
  };

  const root = rig.bones.find((bone) => bone.id === rig.rootBoneId);
  if (root) {
    visit(root);
  }

  const emitted = new Set(sorted.map((bone) => bone.id));
  for (const bone of sortById(rig.bones)) {
    if (!emitted.has(bone.id)) {
      visit(bone);
    }
  }

  return sorted;
}

function sortParts(parts: readonly PartDefinition[]): readonly PartDefinition[] {
  return [...parts].sort((left, right) => {
    const drawOrderDelta = (left.drawOrder ?? 0) - (right.drawOrder ?? 0);
    return drawOrderDelta || compareIds(left.id, right.id);
  });
}

function sortTransitions(transitions: readonly AnimationTransition[]): readonly AnimationTransition[] {
  return [...transitions].sort((left, right) => compareIds(left.id, right.id));
}

function sortConditions(conditions: readonly AnimationCondition[]): readonly AnimationCondition[] {
  return [...conditions].sort((left, right) => {
    const parameterDelta = compareIds(left.parameterId, right.parameterId);
    if (parameterDelta !== 0) {
      return parameterDelta;
    }
    const operatorDelta = left.operator.localeCompare(right.operator);
    if (operatorDelta !== 0) {
      return operatorDelta;
    }
    return String(left.value).localeCompare(String(right.value));
  });
}

function sortKeyframes(keyframes: readonly Keyframe[]): readonly Keyframe[] {
  return [...keyframes].sort(
    (left, right) => left.time - right.time || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value))
  );
}

function sortEvents(events: readonly AnimationEvent[]): readonly AnimationEvent[] {
  return [...events].sort((left, right) => left.time - right.time || left.type.localeCompare(right.type));
}

function sortById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) => compareIds(left.id, right.id));
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right);
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
