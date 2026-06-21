import {
  BONES_RUNTIME_TARGET,
  BONES_SCHEMA_VERSION,
  assertRigProject,
  type AnimationClip as SourceAnimationClip,
  type AnimationTrack,
  type AnimationTrackProperty,
  type BoneDefinition,
  type EditorMetadata,
  type PartDefinition,
  type PathCommand,
  type RigProject,
  type Transform2D
} from "@bones/schema";
import type {
  AnimationClip,
  BoneTransform,
  EditorProjectState,
  EditorTransition,
  Keyframe,
  ProceduralPresetState,
  ShapePart
} from "./editorState";
import { initialEditorProject } from "./editorState";

const projectId = "shadow-hero";
const rigId = "shadow-hero-rig";
const stateMachineId = "shadow-hero-state-machine";

export function toSourceProject(project: EditorProjectState): RigProject {
  const source: RigProject = {
    schemaVersion: BONES_SCHEMA_VERSION,
    runtimeTarget: BONES_RUNTIME_TARGET,
    id: projectId,
    name: project.name,
    rigs: [
      {
        id: rigId,
        name: project.name,
        rootBoneId: project.hierarchy[0] ?? "root",
        bones: project.hierarchy.map((boneId) => toSourceBone(project, boneId)),
        parts: Object.values(project.parts).map(toSourcePart),
        editor: {
          custom: {
            selectedBoneId: project.selectedBoneId,
            hierarchy: [...project.hierarchy],
            dirty: project.dirty,
            dirtyParts: [...project.dirtyParts],
            procedural: proceduralToJson(project.procedural)
          }
        }
      }
    ],
    animations: Object.values(project.animations).map(toSourceAnimationClip),
    poses: Object.values(project.poses).map((pose) => ({
      id: pose.id,
      name: pose.name,
      rigId,
      boneTransforms: pose.boneTransforms,
      editor: { tags: pose.tags }
    })),
    stateMachines: [
      {
        id: stateMachineId,
        name: "Shadow Hero State Machine",
        initialStateId: project.stateMachine.initialStateId,
        states: project.stateMachine.states.map((state) => ({ id: state.id, name: state.id, clipId: state.clipId })),
        transitions: project.stateMachine.transitions.map(toSourceTransition),
        parameters: Object.entries(project.stateMachine.parameters).map(([id, value]) => ({
          id,
          type: typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string",
          defaultValue: value
        }))
      }
    ],
    editor: {
      custom: {
        savedFrom: "bones-editor",
        procedural: proceduralToJson(project.procedural)
      }
    }
  };

  return assertRigProject(source);
}

export function fromSourceProject(sourceInput: unknown): EditorProjectState {
  const source = assertRigProject(sourceInput);
  const rig = source.rigs[0];
  if (!rig) {
    throw new Error("Source project is missing a rig.");
  }

  const hierarchy = readStringArray(rig.editor?.custom?.hierarchy) ?? orderBones(rig.bones, rig.rootBoneId);
  const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, fromTransform(bone.transform)]));
  const parents = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone.parentId ?? null]));
  const parts = Object.fromEntries((rig.parts ?? []).map((part) => [part.id, fromSourcePart(part)]));
  const machine = source.stateMachines?.[0];
  const procedural = readProcedural(rig.editor?.custom?.procedural ?? source.editor?.custom?.procedural);

  return {
    ...initialEditorProject,
    name: source.name,
    selectedBoneId: stringValue(rig.editor?.custom?.selectedBoneId) ?? rig.rootBoneId,
    hierarchy,
    parents,
    bones,
    parts,
    poses: Object.fromEntries(
      (source.poses ?? []).map((pose) => [
        pose.id,
        {
          id: pose.id,
          name: pose.name,
          boneTransforms: pose.boneTransforms,
          tags: pose.editor?.tags ?? []
        }
      ])
    ),
    animations: Object.fromEntries((source.animations ?? []).map((clip) => [clip.id, fromSourceAnimationClip(clip)])),
    stateMachine: machine
      ? {
          initialStateId: machine.initialStateId,
          states: machine.states.map((state) => ({ id: state.id, clipId: state.clipId ?? "" })),
          transitions: (machine.transitions ?? []).map((transition) => ({
            id: transition.id,
            fromStateId: transition.fromStateId,
            toStateId: transition.toStateId,
            duration: transition.duration,
            priority: transition.priority ?? 0,
            canInterrupt: transition.canInterrupt ?? true,
            syncMode: "none"
          })),
          parameters: Object.fromEntries((machine.parameters ?? []).map((parameter) => [parameter.id, parameter.defaultValue]))
        }
      : initialEditorProject.stateMachine,
    procedural,
    dirty: Boolean(rig.editor?.custom?.dirty),
    dirtyParts: readStringArray(rig.editor?.custom?.dirtyParts) ?? []
  };
}

function toSourceBone(project: EditorProjectState, boneId: string): BoneDefinition {
  return {
    id: boneId,
    name: boneId,
    ...(project.parents[boneId] ? { parentId: project.parents[boneId] ?? undefined } : {}),
    transform: toTransform(project.bones[boneId] ?? identityTransform())
  };
}

function toSourcePart(part: ShapePart): PartDefinition {
  const editor: EditorMetadata = {
    custom: {
      pivot: [...part.pivot],
      points: part.points.map((point) => [...point]),
      width: part.width ?? null,
      anchor: part.anchor ? [...part.anchor] : null,
      offset: part.offset ? [...part.offset] : null,
      assetPath: part.assetPath ?? null
    }
  };

  return {
    id: part.id,
    name: part.id,
    boneId: part.boneId,
    type: part.type,
    drawOrder: part.zIndex ?? 0,
    transform: identityTransform(),
    fill: { color: "#050505", alpha: 1 },
    ...(part.type === "path" ? { path: { closed: true, commands: pointsToPath(part.points) } } : {}),
    ...(part.type === "procedural" ? { procedural: { preset: part.preset ?? "organic-blob" } } : {}),
    ...(part.type === "svg" ? { svg: { source: part.assetPath ?? part.id } } : {}),
    editor
  };
}

function fromSourcePart(part: PartDefinition): ShapePart {
  const custom = part.editor?.custom;
  const assetPath = stringValue(custom?.assetPath) ?? part.svg?.source;
  const width = numberValue(custom?.width);
  const anchor = readNumberPair(custom?.anchor);
  const offset = readNumberPair(custom?.offset);
  return {
    id: part.id,
    boneId: part.boneId,
    type: part.type === "mesh" ? "path" : part.type,
    pivot: readNumberPair(custom?.pivot) ?? [0, 0],
    points: readPointList(custom?.points) ?? pathToPoints(part.path?.commands ?? []),
    preset: part.procedural?.preset === "tapered-limb" || part.procedural?.preset === "organic-blob" || part.procedural?.preset === "capsule" ? part.procedural.preset : undefined,
    ...(assetPath ? { assetPath } : {}),
    ...(width ? { width } : {}),
    ...(anchor ? { anchor } : {}),
    ...(offset ? { offset } : {}),
    zIndex: part.drawOrder ?? 0
  };
}

function toSourceAnimationClip(clip: AnimationClip): SourceAnimationClip {
  return {
    id: clip.id,
    name: clip.id,
    duration: clip.duration,
    loop: clip.loop,
    tracks: Object.entries(clip.tracks).map(([trackId, keyframes]) => toSourceTrack(trackId, keyframes))
  };
}

function fromSourceAnimationClip(clip: SourceAnimationClip): AnimationClip {
  return {
    id: clip.id,
    duration: clip.duration,
    loop: clip.loop ?? false,
    tracks: Object.fromEntries(clip.tracks.map((track) => [fromTrackId(track), track.keyframes.map(fromSourceKeyframe)]))
  };
}

function toSourceTrack(trackId: string, keyframes: readonly Keyframe[]): AnimationTrack {
  const splitIndex = trackId.lastIndexOf(".");
  const boneId = splitIndex > 0 ? trackId.slice(0, splitIndex) : trackId;
  const property = splitIndex > 0 ? trackId.slice(splitIndex + 1) : "x";
  return {
    id: trackId,
    target: { kind: "bone", id: boneId },
    property: toSourceTrackProperty(property),
    keyframes: keyframes.map((keyframe) => ({
      time: keyframe.time,
      value: keyframe.value,
      interpolation: keyframe.interpolation,
      ...(keyframe.curve ? { curve: keyframe.curve } : {}),
      editor: { custom: { id: keyframe.id } }
    }))
  };
}

function fromTrackId(track: AnimationTrack): string {
  const property = track.property.startsWith("transform.") ? track.property.slice("transform.".length) : track.property;
  return `${track.target.id}.${property}`;
}

function fromSourceKeyframe(keyframe: SourceAnimationClip["tracks"][number]["keyframes"][number]): Keyframe {
  return {
    id: stringValue(keyframe.editor?.custom?.id) ?? `key-${keyframe.time}`,
    time: keyframe.time,
    value: typeof keyframe.value === "number" ? keyframe.value : 0,
    interpolation: keyframe.interpolation ?? "linear",
    ...(keyframe.curve ? { curve: keyframe.curve } : {})
  };
}

function toSourceTransition(transition: EditorTransition) {
  return {
    id: transition.id,
    fromStateId: transition.fromStateId,
    toStateId: transition.toStateId,
    duration: transition.duration,
    priority: transition.priority,
    canInterrupt: transition.canInterrupt
  };
}

function toSourceTrackProperty(property: string): AnimationTrackProperty {
  if (property === "x") {
    return "transform.x";
  }
  if (property === "y") {
    return "transform.y";
  }
  if (property === "rotation") {
    return "transform.rotation";
  }
  if (property === "scaleX") {
    return "transform.scaleX";
  }
  if (property === "scaleY") {
    return "transform.scaleY";
  }
  return "transform.x";
}

function orderBones(bones: readonly BoneDefinition[], rootBoneId: string): string[] {
  const children = new Map<string | null, string[]>();
  for (const bone of bones) {
    const parent = bone.parentId ?? null;
    children.set(parent, [...(children.get(parent) ?? []), bone.id]);
  }
  const ordered: string[] = [];
  const visit = (boneId: string) => {
    ordered.push(boneId);
    for (const childId of children.get(boneId) ?? []) {
      visit(childId);
    }
  };
  visit(rootBoneId);
  for (const bone of bones) {
    if (!ordered.includes(bone.id)) {
      visit(bone.id);
    }
  }
  return ordered;
}

function pointsToPath(points: readonly (readonly [number, number])[]): PathCommand[] {
  if (!points.length) {
    return [{ type: "M", x: 0, y: 0 }, { type: "L", x: 1, y: 0 }, { type: "L", x: 1, y: 1 }, { type: "Z" }];
  }
  const [first, ...rest] = points;
  return [{ type: "M", x: first![0], y: first![1] }, ...rest.map(([x, y]) => ({ type: "L" as const, x, y })), { type: "Z" }];
}

function pathToPoints(commands: readonly PathCommand[]): readonly (readonly [number, number])[] {
  return commands.flatMap((command) => ("x" in command && "y" in command ? [[command.x, command.y] as const] : []));
}

function toTransform(transform: BoneTransform): Transform2D {
  return { x: transform.x, y: transform.y, rotation: transform.rotation, scaleX: transform.scaleX, scaleY: transform.scaleY };
}

function fromTransform(transform: Transform2D): BoneTransform {
  return { x: transform.x, y: transform.y, rotation: transform.rotation, scaleX: transform.scaleX, scaleY: transform.scaleY };
}

function identityTransform(): Transform2D {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

function proceduralToJson(procedural: ProceduralPresetState) {
  return {
    breathing: {
      enabled: procedural.breathing.enabled,
      frequency: procedural.breathing.frequency,
      amplitude: procedural.breathing.amplitude,
      affectedBones: [...procedural.breathing.affectedBones]
    },
    secondaryMotion: {
      enabled: procedural.secondaryMotion.enabled,
      target: procedural.secondaryMotion.target,
      stiffness: procedural.secondaryMotion.stiffness,
      damping: procedural.secondaryMotion.damping,
      velocityInfluence: procedural.secondaryMotion.velocityInfluence
    },
    squashStretch: {
      enabled: procedural.squashStretch.enabled,
      targetBone: procedural.squashStretch.targetBone,
      landingImpactScale: procedural.squashStretch.landingImpactScale
    },
    footIk: {
      enabled: procedural.footIk.enabled,
      feet: [...procedural.footIk.feet],
      maxCorrection: procedural.footIk.maxCorrection,
      blend: procedural.footIk.blend
    }
  };
}

function readProcedural(value: unknown): ProceduralPresetState {
  if (!isRecord(value)) {
    return initialEditorProject.procedural;
  }
  return {
    breathing: isRecord(value.breathing) ? { ...initialEditorProject.procedural.breathing, ...value.breathing } : initialEditorProject.procedural.breathing,
    secondaryMotion: isRecord(value.secondaryMotion) ? { ...initialEditorProject.procedural.secondaryMotion, ...value.secondaryMotion } : initialEditorProject.procedural.secondaryMotion,
    squashStretch: isRecord(value.squashStretch) ? { ...initialEditorProject.procedural.squashStretch, ...value.squashStretch } : initialEditorProject.procedural.squashStretch,
    footIk: isRecord(value.footIk) ? { ...initialEditorProject.procedural.footIk, ...value.footIk } : initialEditorProject.procedural.footIk
  };
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function readPointList(value: unknown): readonly (readonly [number, number])[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const points = value.map(readNumberPair);
  return points.every(Boolean) ? (points as readonly (readonly [number, number])[]) : undefined;
}

function readNumberPair(value: unknown): readonly [number, number] | undefined {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number" ? [value[0], value[1]] : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
