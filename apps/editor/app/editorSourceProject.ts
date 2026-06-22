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
  type PoseDefinition as SourcePoseDefinition,
  type RigProject,
  type Transform2D
} from "@bones/schema";
import type {
  AnimationClip,
  AutosaveState,
  BoneMetadata,
  BoneTransform,
  DirtyScopes,
  EditorProjectState,
  EditorTransition,
  Keyframe,
  PoseDefinition,
  ProceduralPresetState,
  ShapePart,
  TimelineState
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
    projectId,
    name: project.name,
    units: "pixels",
    defaultFrameRate: 60,
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
            dirtyScopes: dirtyScopesToJson(project.dirtyScopes),
            autosave: autosaveToJson(project.autosave),
            timeline: timelineToJson(project.timeline),
            procedural: proceduralToJson(project.procedural)
          }
        }
      }
    ],
    animations: Object.values(project.animations).map(toSourceAnimationClip),
    poses: Object.values(project.poses).map((pose) => toSourcePose(pose, rigId)),
    proceduralPresets: proceduralPresetsToSource(project.procedural),
    stateMachines: [
      {
        id: stateMachineId,
        name: "Shadow Hero State Machine",
        initialStateId: project.stateMachine.initialStateId,
        states: project.stateMachine.states.map((state) => ({ id: state.id, name: state.id, clipId: state.clipId, ...(state.blendTree ? { blendTree: state.blendTree } : {}), editor: { tags: state.tags ?? [] } })),
        transitions: project.stateMachine.transitions.map(toSourceTransition),
        parameters: Object.entries(project.stateMachine.parameters).map(([id, value]) => ({
          id,
          type: typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string",
          defaultValue: value
        })),
        editor: { custom: { preview: project.stateMachine.preview } }
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
  const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, fromTransform(bone.local ?? bone.transform ?? identityTransform())]));
  const boneMetadata: Readonly<Record<string, BoneMetadata>> = Object.fromEntries(
    rig.bones.map((bone) => {
      const facing = bone.editor?.custom?.facing === -1 || bone.editor?.custom?.facing === 1 ? bone.editor.custom.facing : undefined;
      const metadata: BoneMetadata = {
        ...(bone.inheritRotation === false ? { locked: true } : {}),
        ...(bone.mirrorGroup ? { mirrorGroup: bone.mirrorGroup } : {}),
        ...(bone.tags ? { tags: bone.tags } : {}),
        ...(typeof bone.editor?.custom?.hidden === "boolean" ? { hidden: bone.editor.custom.hidden } : {}),
        ...(facing ? { facing } : {})
      };
      return [bone.id, metadata];
    })
  );
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
    boneMetadata,
    parts,
    poses: Object.fromEntries((source.poses ?? []).map((pose) => [pose.id, fromSourcePose(pose)])),
    animations: Object.fromEntries((source.animations ?? []).map((clip) => [clip.id, fromSourceAnimationClip(clip)])),
    stateMachine: machine
      ? {
          initialStateId: machine.initialStateId,
          states: machine.states.map((state) => ({ id: state.id, clipId: state.clipId ?? "", ...(state.blendTree ? { blendTree: state.blendTree } : {}), tags: state.editor?.tags ?? [] })),
          transitions: (machine.transitions ?? []).map((transition) => ({
            id: transition.id,
            fromStateId: transition.fromStateId,
            toStateId: transition.toStateId,
            duration: transition.duration,
            easing: transition.easing ?? "linear",
            priority: transition.priority ?? 0,
            canInterrupt: transition.canInterrupt ?? true,
            syncMode: transition.syncMode ?? "none",
            conditions: (transition.conditions ?? []).map((condition) => ({ parameter: condition.parameterId, op: condition.operator, value: condition.value }))
          })),
          parameters: Object.fromEntries((machine.parameters ?? []).map((parameter) => [parameter.id, parameter.defaultValue])),
          preview: readStateMachinePreview(machine.editor?.custom?.preview)
        }
      : initialEditorProject.stateMachine,
    procedural,
    timeline: readTimeline(rig.editor?.custom?.timeline),
    dirty: Boolean(rig.editor?.custom?.dirty),
    dirtyParts: readStringArray(rig.editor?.custom?.dirtyParts) ?? [],
    dirtyScopes: readDirtyScopes(rig.editor?.custom?.dirtyScopes),
    autosave: readAutosave(rig.editor?.custom?.autosave)
  };
}

function toSourceBone(project: EditorProjectState, boneId: string): BoneDefinition {
  const metadata = project.boneMetadata[boneId];
  return {
    id: boneId,
    name: boneId,
    ...(project.parents[boneId] ? { parentId: project.parents[boneId] ?? undefined } : {}),
    local: toTransform(project.bones[boneId] ?? identityTransform()),
    ...(metadata?.mirrorGroup ? { mirrorGroup: metadata.mirrorGroup } : {}),
    ...(metadata?.tags?.length ? { tags: metadata.tags } : {}),
    ...(metadata?.locked ? { inheritRotation: false, inheritScale: false } : {}),
    ...(metadata?.hidden !== undefined || metadata?.facing !== undefined
      ? {
          editor: {
            custom: {
              ...(metadata.hidden !== undefined ? { hidden: metadata.hidden } : {}),
              ...(metadata.facing !== undefined ? { facing: metadata.facing } : {})
            }
          }
        }
      : {})
  };
}

function toSourcePart(part: ShapePart): PartDefinition {
  const editor: EditorMetadata = {
    custom: {
      pivot: [...part.pivot],
      points: part.points.map((point) => [...point]),
      pathCommands: part.pathCommands ? part.pathCommands.map((command) => ({ ...command })) : null,
      svgViewBox: part.svgViewBox ? [...part.svgViewBox] : null,
      width: part.width ?? null,
      anchor: part.anchor ? [...part.anchor] : null,
      offset: part.offset ? [...part.offset] : null,
      assetPath: part.assetPath ?? null
    }
  };

  const exportedType = part.pathCommands ? "path" : part.type;
  return {
    id: part.id,
    name: part.id,
    boneId: part.boneId,
    type: exportedType,
    drawOrder: part.zIndex ?? 0,
    local: part.pathCommands ? partLocalTransform(part) : identityTransform(),
    fill: { type: "solid", color: "#050505", alpha: 1 },
    ...(exportedType === "path" ? { path: { closed: true, commands: part.pathCommands ?? pointsToPath(part.points) } } : {}),
    ...(exportedType === "procedural" ? { procedural: { preset: part.preset ?? "organic-blob" } } : {}),
    ...(exportedType === "svg" ? { svg: { source: part.assetPath ?? part.id } } : {}),
    editor
  };
}

function fromSourcePart(part: PartDefinition): ShapePart {
  const custom = part.editor?.custom;
  const assetPath = stringValue(custom?.assetPath) ?? part.svg?.source;
  const width = numberValue(custom?.width);
  const anchor = readNumberPair(custom?.anchor);
  const offset = readNumberPair(custom?.offset);
  const svgViewBox = readViewBox(custom?.svgViewBox);
  const pathCommands = readPathCommands(custom?.pathCommands) ?? part.path?.commands;
  return {
    id: part.id,
    boneId: part.boneId,
    type: part.type === "mesh" ? "path" : part.type,
    pivot: readNumberPair(custom?.pivot) ?? [0, 0],
    points: readPointList(custom?.points) ?? pathToPoints(part.path?.commands ?? []),
    ...(pathCommands ? { pathCommands } : {}),
    preset: part.procedural?.preset === "tapered-limb" || part.procedural?.preset === "organic-blob" || part.procedural?.preset === "capsule" ? part.procedural.preset : undefined,
    ...(assetPath ? { assetPath } : {}),
    ...(svgViewBox ? { svgViewBox } : {}),
    ...(width ? { width } : {}),
    ...(anchor ? { anchor } : {}),
    ...(offset ? { offset } : {}),
    zIndex: part.drawOrder ?? 0
  };
}

function toSourcePose(pose: PoseDefinition, rigId: string): SourcePoseDefinition {
  return {
    id: pose.id,
    name: pose.name,
    rigId,
    boneTransforms: pose.boneTransforms,
    ...(pose.partProperties ? { partProperties: pose.partProperties } : {}),
    editor: {
      tags: pose.tags,
      custom: {
        ...(pose.deforms ? { deforms: poseDeformsToJson(pose.deforms) } : {})
      }
    }
  };
}

function fromSourcePose(pose: SourcePoseDefinition): PoseDefinition {
  const deforms = readPoseDeforms(pose.editor?.custom?.deforms);
  return {
    id: pose.id,
    name: pose.name,
    boneTransforms: pose.boneTransforms,
    ...(deforms ? { deforms } : {}),
    ...(pose.partProperties ? { partProperties: pose.partProperties } : {}),
    tags: pose.editor?.tags ?? []
  };
}

function toSourceAnimationClip(clip: AnimationClip): SourceAnimationClip {
  return {
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    frameRate: clip.frameRate,
    loop: clip.loop,
    tracks: Object.entries(clip.tracks).map(([trackId, keyframes]) => toSourceTrack(trackId, keyframes)),
    events: clip.events.map(({ id: _id, ...event }) => event),
    markers: clip.markers,
    tags: clip.tags
  };
}

function fromSourceAnimationClip(clip: SourceAnimationClip): AnimationClip {
  return {
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    frameRate: clip.frameRate ?? clip.fps ?? 60,
    loop: clip.loop ?? false,
    tracks: Object.fromEntries(clip.tracks.map((track) => [fromTrackId(track), track.keyframes.map(fromSourceKeyframe)])),
    events: (clip.events ?? []).map((event, index) => ({ id: `${clip.id}-event-${index}`, ...event })),
    markers: clip.markers ?? [],
    tags: clip.tags ?? []
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
      editor: { custom: { id: keyframe.id, ...(keyframe.curvePreset ? { curvePreset: keyframe.curvePreset } : {}), ...(keyframe.tangentIn !== undefined ? { tangentIn: keyframe.tangentIn } : {}), ...(keyframe.tangentOut !== undefined ? { tangentOut: keyframe.tangentOut } : {}) } }
    }))
  };
}

function fromTrackId(track: AnimationTrack): string {
  const property = track.property.startsWith("transform.") ? track.property.slice("transform.".length) : track.property;
  return `${track.target.id}.${property}`;
}

function fromSourceKeyframe(keyframe: SourceAnimationClip["tracks"][number]["keyframes"][number]): Keyframe {
  const curvePreset = readCurvePreset(keyframe.editor?.custom?.curvePreset);
  const tangentIn = numberValue(keyframe.editor?.custom?.tangentIn);
  const tangentOut = numberValue(keyframe.editor?.custom?.tangentOut);
  return {
    id: stringValue(keyframe.editor?.custom?.id) ?? `key-${keyframe.time}`,
    time: keyframe.time,
    value: typeof keyframe.value === "number" ? keyframe.value : 0,
    interpolation: keyframe.interpolation ?? "linear",
    ...(keyframe.curve ? { curve: keyframe.curve } : {}),
    ...(curvePreset ? { curvePreset } : {}),
    ...(tangentIn !== undefined ? { tangentIn } : {}),
    ...(tangentOut !== undefined ? { tangentOut } : {})
  };
}

function readCurvePreset(value: unknown): Keyframe["curvePreset"] | undefined {
  const preset = stringValue(value);
  return preset === "linear" ||
    preset === "step" ||
    preset === "hold" ||
    preset === "bezier" ||
    preset === "easeIn" ||
    preset === "easeOut" ||
    preset === "easeInOut" ||
    preset === "cubicBezier" ||
    preset === "stepped" ||
    preset === "spring" ||
    preset === "overshoot" ||
    preset === "anticipation" ||
    preset === "custom"
    ? preset
    : undefined;
}

function toSourceTransition(transition: EditorTransition) {
  return {
    id: transition.id,
    fromStateId: transition.fromStateId,
    toStateId: transition.toStateId,
    duration: transition.duration,
    easing: transition.easing,
    priority: transition.priority,
    canInterrupt: transition.canInterrupt,
    syncMode: transition.syncMode,
    conditions: transition.conditions.map((condition) => ({ parameterId: condition.parameter, operator: condition.op, value: condition.value }))
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

function partLocalTransform(part: ShapePart): Transform2D {
  if (!part.svgViewBox || !part.width) {
    return identityTransform();
  }
  const [, , width, height] = part.svgViewBox;
  const scale = width > 0 ? part.width / width : 1;
  const anchor = part.anchor ?? [0, 0];
  const offset = part.offset ?? [0, 0];
  return {
    x: offset[0] - anchor[0] * width * scale,
    y: offset[1] - anchor[1] * height * scale,
    rotation: 0,
    scaleX: scale,
    scaleY: scale
  };
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

function proceduralPresetsToSource(procedural: ProceduralPresetState) {
  return [
    { id: "breathing", type: "breathing" as const, enabled: procedural.breathing.enabled, frequency: procedural.breathing.frequency, amplitude: procedural.breathing.amplitude, affectedBones: procedural.breathing.affectedBoneTransforms },
    {
      id: "secondary-motion",
      type: "secondaryMotion" as const,
      enabled: procedural.secondaryMotion.enabled,
      target: procedural.secondaryMotion.target,
      stiffness: procedural.secondaryMotion.stiffness,
      damping: procedural.secondaryMotion.damping,
      velocityInfluence: procedural.secondaryMotion.velocityInfluence,
      gravityInfluence: procedural.secondaryMotion.gravityInfluence,
      windInfluence: procedural.secondaryMotion.windInfluence,
      maxOffset: procedural.secondaryMotion.maxOffset
    },
    { id: "squash-stretch", type: "squashStretch" as const, enabled: procedural.squashStretch.enabled, targetBone: procedural.squashStretch.targetBone, landingImpactScale: procedural.squashStretch.landingImpactScale, rules: procedural.squashStretch.rules },
    { id: "foot-ik", type: "footIK" as const, enabled: procedural.footIk.enabled, feet: procedural.footIk.footChains, maxCorrection: procedural.footIk.maxCorrection, blend: procedural.footIk.blend }
  ];
}

function dirtyScopesToJson(dirtyScopes: DirtyScopes) {
  return {
    project: [...dirtyScopes.project],
    bones: [...dirtyScopes.bones],
    parts: [...dirtyScopes.parts],
    animations: [...dirtyScopes.animations],
    poses: [...dirtyScopes.poses],
    stateMachine: [...dirtyScopes.stateMachine],
    procedural: [...dirtyScopes.procedural]
  };
}

function autosaveToJson(autosave: AutosaveState) {
  return {
    status: autosave.status,
    revision: autosave.revision,
    throttleMs: autosave.throttleMs,
    lastChangedAt: autosave.lastChangedAt,
    nextSaveAt: autosave.nextSaveAt,
    ...(autosave.lastSavedAt !== undefined ? { lastSavedAt: autosave.lastSavedAt } : {})
  };
}

function poseDeformsToJson(deforms: Readonly<Record<string, readonly (readonly [number, number])[]>>) {
  return Object.fromEntries(Object.entries(deforms).map(([partId, points]) => [partId, points.map((point) => [point[0], point[1]])]));
}

function timelineToJson(timeline: TimelineState) {
  return {
    selectedClipId: timeline.selectedClipId,
    selectedKeyIds: [...timeline.selectedKeyIds],
    keyClipboard: timeline.keyClipboard.map((item) => {
      const { curve: _curve, ...keyframe } = item.keyframe;
      return {
        trackId: item.trackId,
        keyframe: {
          ...keyframe,
          ...(item.keyframe.curve ? { curve: [...item.keyframe.curve] } : {})
        }
      };
    }),
    autoKey: timeline.autoKey,
    snappingFps: timeline.snappingFps,
    virtualWindow: { ...timeline.virtualWindow },
    curvePreview: { ...timeline.curvePreview }
  };
}

function readProcedural(value: unknown): ProceduralPresetState {
  if (!isRecord(value)) {
    return initialEditorProject.procedural;
  }
  return {
    inputs: isRecord(value.inputs) ? { ...initialEditorProject.procedural.inputs, ...value.inputs } : initialEditorProject.procedural.inputs,
    breathing: isRecord(value.breathing) ? { ...initialEditorProject.procedural.breathing, ...value.breathing } : initialEditorProject.procedural.breathing,
    secondaryMotion: isRecord(value.secondaryMotion) ? { ...initialEditorProject.procedural.secondaryMotion, ...value.secondaryMotion } : initialEditorProject.procedural.secondaryMotion,
    squashStretch: isRecord(value.squashStretch) ? { ...initialEditorProject.procedural.squashStretch, ...value.squashStretch } : initialEditorProject.procedural.squashStretch,
    footIk: isRecord(value.footIk) ? { ...initialEditorProject.procedural.footIk, ...value.footIk } : initialEditorProject.procedural.footIk
  };
}

function readDirtyScopes(value: unknown): DirtyScopes {
  if (!isRecord(value)) {
    return initialEditorProject.dirtyScopes;
  }
  return {
    project: readStringArray(value.project) ?? [],
    bones: readStringArray(value.bones) ?? [],
    parts: readStringArray(value.parts) ?? [],
    animations: readStringArray(value.animations) ?? [],
    poses: readStringArray(value.poses) ?? [],
    stateMachine: readStringArray(value.stateMachine) ?? [],
    procedural: readStringArray(value.procedural) ?? []
  };
}

function readAutosave(value: unknown): AutosaveState {
  if (!isRecord(value)) {
    return initialEditorProject.autosave;
  }
  const lastSavedAt = numberValue(value.lastSavedAt);
  return {
    status: value.status === "pending" || value.status === "saved" ? value.status : "idle",
    revision: numberValue(value.revision) ?? 0,
    throttleMs: numberValue(value.throttleMs) ?? initialEditorProject.autosave.throttleMs,
    lastChangedAt: numberValue(value.lastChangedAt) ?? 0,
    nextSaveAt: numberValue(value.nextSaveAt) ?? 0,
    ...(lastSavedAt !== undefined ? { lastSavedAt } : {})
  };
}

function readTimeline(value: unknown): TimelineState {
  if (!isRecord(value)) {
    return initialEditorProject.timeline;
  }
  return {
    selectedClipId: stringValue(value.selectedClipId) ?? initialEditorProject.timeline.selectedClipId,
    selectedKeyIds: readStringArray(value.selectedKeyIds) ?? [],
    keyClipboard: readTimelineClipboard(value.keyClipboard),
    autoKey: typeof value.autoKey === "boolean" ? value.autoKey : false,
    snappingFps: numberValue(value.snappingFps) ?? 60,
    virtualWindow: isRecord(value.virtualWindow)
      ? {
          startRow: numberValue(value.virtualWindow.startRow) ?? 0,
          rowCount: numberValue(value.virtualWindow.rowCount) ?? 12
        }
      : initialEditorProject.timeline.virtualWindow,
    curvePreview: isRecord(value.curvePreview)
      ? {
          fromClipId: stringValue(value.curvePreview.fromClipId) ?? "jump",
          toClipId: stringValue(value.curvePreview.toClipId) ?? "land",
          weight: numberValue(value.curvePreview.weight) ?? 0.5
        }
      : initialEditorProject.timeline.curvePreview
  };
}

function readStateMachinePreview(value: unknown): EditorProjectState["stateMachine"]["preview"] {
  if (!isRecord(value)) {
    return initialEditorProject.stateMachine.preview;
  }
  return {
    fromStateId: stringValue(value.fromStateId) ?? initialEditorProject.stateMachine.preview.fromStateId,
    toStateId: stringValue(value.toStateId) ?? initialEditorProject.stateMachine.preview.toStateId,
    weight: numberValue(value.weight) ?? initialEditorProject.stateMachine.preview.weight
  };
}

function readTimelineClipboard(value: unknown): TimelineState["keyClipboard"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.trackId !== "string" || !isRecord(item.keyframe)) {
      return [];
    }
    return [{ trackId: item.trackId, keyframe: fromSourceKeyframe({ time: numberValue(item.keyframe.time) ?? 0, value: jsonScalarValue(item.keyframe.value), interpolation: "linear", editor: { custom: { id: stringValue(item.keyframe.id) ?? "clipboard-key" } } }) }];
  });
}

function jsonScalarValue(value: unknown): string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : 0;
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

function readPoseDeforms(value: unknown): Readonly<Record<string, readonly (readonly [number, number])[]>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).map(([partId, points]) => [partId, readPointList(points) ?? []]));
}

function readPathCommands(value: unknown): readonly PathCommand[] | undefined {
  return Array.isArray(value) && value.every(isPathCommand) ? value : undefined;
}

function isPathCommand(value: unknown): value is PathCommand {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if ((value.type === "M" || value.type === "L") && typeof value.x === "number" && typeof value.y === "number") {
    return true;
  }
  if (value.type === "Q") {
    return typeof value.cx === "number" && typeof value.cy === "number" && typeof value.x === "number" && typeof value.y === "number";
  }
  if (value.type === "C") {
    return (
      typeof value.c1x === "number" &&
      typeof value.c1y === "number" &&
      typeof value.c2x === "number" &&
      typeof value.c2y === "number" &&
      typeof value.x === "number" &&
      typeof value.y === "number"
    );
  }
  return value.type === "Z";
}

function readNumberPair(value: unknown): readonly [number, number] | undefined {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number" ? [value[0], value[1]] : undefined;
}

function readViewBox(value: unknown): readonly [number, number, number, number] | undefined {
  return Array.isArray(value) &&
    value.length === 4 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    typeof value[2] === "number" &&
    typeof value[3] === "number"
    ? [value[0], value[1], value[2], value[3]]
    : undefined;
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
