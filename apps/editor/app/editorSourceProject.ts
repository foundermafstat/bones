import {
  BONES_RUNTIME_TARGET,
  BONES_SCHEMA_VERSION,
  assertRigProject,
  type AnimationClip as SourceAnimationClip,
  type AnimationTrack,
  type AnimationTrackTargetKind,
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
  CharacterKind,
  DirtyScopes,
  EditorFacialRig,
  EditorIkChain,
  EditorRigTopology,
  EditorProjectState,
  EditorTransition,
  Keyframe,
  PoseDefinition,
  ProceduralPresetState,
  ShapePart,
  TimelineState
} from "./editorState";
import { createDefaultEditorIkChains, createEditorAppearance, createEditorTopology, hasAnimatedDrawOrderTracks, initialEditorProject } from "./editorState.ts";

export function toSourceProject(project: EditorProjectState): RigProject {
  const canUseSlotModel = Object.keys(project.visualSlots).length > 0 || !hasAnimatedDrawOrderTracks(project);
  const appearance = Object.keys(project.visualSlots).length ? project : { ...project, ...createEditorAppearance(project.parts) };
  const source: RigProject = {
    schemaVersion: BONES_SCHEMA_VERSION,
    runtimeTarget: BONES_RUNTIME_TARGET,
    id: project.projectId,
    projectId: project.projectId,
    name: project.name,
    units: "pixels",
    defaultFrameRate: 60,
    rigs: [
      {
        id: project.rigId,
        name: project.name,
        rootBoneId: project.hierarchy[0] ?? "root",
        bones: project.hierarchy.map((boneId) => toSourceBone(project, boneId)),
        parts: Object.values(project.parts).map(toSourcePart),
        ...(canUseSlotModel ? {
          visualSlots: Object.values(appearance.visualSlots).map((slot) => ({ id: slot.id, name: slot.name, boneId: slot.boneId, drawOrder: slot.drawOrder, partIds: [...slot.partIds] })),
          skins: Object.values(appearance.skins).map((skin) => ({
            id: skin.id,
            name: skin.name,
            attachments: Object.entries(skin.attachments).flatMap(([slotId, partId]) => (partId ? [{ slotId, partId }] : []))
          })),
          defaultSkinId: appearance.activeSkinId
        } : {}),
        editor: {
          custom: {
            selectedBoneId: project.selectedBoneId,
            hierarchy: [...project.hierarchy],
            dirty: project.dirty,
            dirtyParts: [...project.dirtyParts],
            dirtyScopes: dirtyScopesToJson(project.dirtyScopes),
            autosave: autosaveToJson(project.autosave),
            timeline: timelineToJson(project.timeline),
            procedural: proceduralToJson(project.procedural),
            activeSkinId: appearance.activeSkinId,
            ikChains: Object.values(project.ikChains).map((chain) => ({ ...chain })),
            topology: topologyToJson(project.topology),
            ...(project.facialRig ? { facialRig: facialRigToJson(project.facialRig) } : {})
          }
        }
      }
    ],
    animations: Object.values(project.animations).map(toSourceAnimationClip),
    poses: Object.values(project.poses).map((pose) => toSourcePose(pose, project.rigId)),
    proceduralPresets: proceduralPresetsToSource(project.procedural),
    stateMachines: [
      {
        id: project.stateMachineId,
        name: `${project.name} State Machine`,
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
        characterKind: project.characterKind,
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
  const animations = Object.fromEntries((source.animations ?? []).map((clip) => [clip.id, fromSourceAnimationClip(clip)]));
  const legacyAppearance = createEditorAppearance(parts);
  const legacyDrawOrderBlocked = !rig.visualSlots?.length && hasAnimatedDrawOrderTracks({ animations });
  const visualSlots = rig.visualSlots?.length
    ? Object.fromEntries(rig.visualSlots.map((slot) => [slot.id, {
        id: slot.id,
        name: slot.name,
        boneId: slot.boneId,
        drawOrder: slot.drawOrder,
        partIds: [...new Set([
          ...(slot.partIds ?? []),
          ...(rig.skins ?? []).flatMap((skin) => skin.attachments.filter((attachment) => attachment.slotId === slot.id).map((attachment) => attachment.partId))
        ])]
      }]))
    : legacyDrawOrderBlocked ? {} : legacyAppearance.visualSlots;
  const skins = rig.skins?.length
    ? Object.fromEntries(rig.skins.map((skin) => [skin.id, { id: skin.id, name: skin.name, attachments: Object.fromEntries(skin.attachments.map((attachment) => [attachment.slotId, attachment.partId])) }]))
    : legacyDrawOrderBlocked ? { default: { id: "default", name: "Legacy", attachments: {} } } : legacyAppearance.skins;
  const requestedSkinId = stringValue(rig.editor?.custom?.activeSkinId) ?? rig.defaultSkinId;
  const activeSkinId = requestedSkinId && skins[requestedSkinId] ? requestedSkinId : Object.keys(skins)[0] ?? "default";
  const ikChains = readEditorIkChains(rig.editor?.custom?.ikChains, bones);
  const machine = source.stateMachines?.[0];
  const procedural = readProcedural(rig.editor?.custom?.procedural ?? source.editor?.custom?.procedural);
  const topology = readEditorTopology(rig.editor?.custom?.topology, hierarchy, parents);
  const facialRig = readEditorFacialRig(rig.editor?.custom?.facialRig, bones, visualSlots, parts);

  return {
    ...initialEditorProject,
    projectId: source.id,
    rigId: rig.id,
    stateMachineId: machine?.id ?? `${source.id}-state-machine`,
    name: source.name,
    characterKind: readCharacterKind(source.editor?.custom?.characterKind),
    selectedBoneId: stringValue(rig.editor?.custom?.selectedBoneId) ?? rig.rootBoneId,
    hierarchy,
    parents,
    bones,
    boneMetadata,
    boneLengths: Object.fromEntries(rig.bones.map((bone) => [bone.id, bone.length ?? 0])),
    topology,
    parts,
    visualSlots,
    skins,
    activeSkinId,
    ...(facialRig ? { facialRig } : {}),
    ikChains,
    poses: Object.fromEntries((source.poses ?? []).map((pose) => [pose.id, fromSourcePose(pose)])),
    animations,
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

export function readEditorFacialRig(
  value: unknown,
  bones: Readonly<Record<string, BoneTransform>>,
  visualSlots: Readonly<Record<string, EditorProjectState["visualSlots"][string]>>,
  parts: EditorProjectState["parts"] = {}
): EditorFacialRig | undefined {
  if (!isRecord(value)) return undefined;
  const expressionSlots = readFacialSideMapping(value.expressionSlots);
  const pupilSlots = readFacialSideMapping(value.pupilSlots);
  const eyeAimBones = readFacialSideMapping(value.eyeAimBones);
  const irisParallaxParts = readFacialSideMapping(value.irisParallaxParts);
  const irisOrigins = readFacialPointMapping(value.irisOrigins);
  const irisParallax = typeof value.irisParallax === "number" && Number.isFinite(value.irisParallax) && value.irisParallax >= 0 && value.irisParallax <= 1 ? value.irisParallax : undefined;
  const gazeBounds = readFacialGazeBounds(value.gazeBounds);
  if (!expressionSlots || !pupilSlots || !eyeAimBones || !gazeBounds || typeof value.linkedByDefault !== "boolean") return undefined;

  const slotIds = [expressionSlots.left, expressionSlots.right, pupilSlots.left, pupilSlots.right];
  if (new Set(slotIds).size !== slotIds.length || slotIds.some((slotId) => !visualSlots[slotId])) return undefined;
  if (eyeAimBones.left === eyeAimBones.right || !bones[eyeAimBones.left] || !bones[eyeAimBones.right]) return undefined;
  const expressionPartIds = new Set([
    ...visualSlots[expressionSlots.left]!.partIds,
    ...visualSlots[expressionSlots.right]!.partIds
  ]);
  const gazeBoundsByExpression = readFacialGazeBoundsByExpression(value.gazeBoundsByExpression, expressionPartIds);
  if (value.gazeBoundsByExpression !== undefined && !gazeBoundsByExpression) return undefined;
  const aperturesByExpression = readFacialAperturesByExpression(value.aperturesByExpression, expressionPartIds);
  if (value.aperturesByExpression !== undefined && !aperturesByExpression) return undefined;
  if (irisParallaxParts && (irisParallaxParts.left === irisParallaxParts.right)) return undefined;
  if (irisParallaxParts && (!parts[irisParallaxParts.left] || !parts[irisParallaxParts.right])) return undefined;

  if ((irisParallaxParts || irisParallax !== undefined) && !irisOrigins) return undefined;

  return { expressionSlots, pupilSlots, eyeAimBones, ...(irisParallaxParts ? { irisParallaxParts } : {}), ...(irisOrigins ? { irisOrigins } : {}), ...(irisParallax !== undefined ? { irisParallax } : {}), gazeBounds, ...(gazeBoundsByExpression ? { gazeBoundsByExpression } : {}), ...(aperturesByExpression ? { aperturesByExpression } : {}), linkedByDefault: value.linkedByDefault };
}

function facialRigToJson(facialRig: EditorFacialRig) {
  return {
    expressionSlots: { ...facialRig.expressionSlots },
    pupilSlots: { ...facialRig.pupilSlots },
    eyeAimBones: { ...facialRig.eyeAimBones },
    ...(facialRig.irisParallaxParts ? { irisParallaxParts: { ...facialRig.irisParallaxParts } } : {}),
    ...(facialRig.irisOrigins ? { irisOrigins: { left: [...facialRig.irisOrigins.left], right: [...facialRig.irisOrigins.right] } } : {}),
    ...(facialRig.irisParallax !== undefined ? { irisParallax: facialRig.irisParallax } : {}),
    gazeBounds: { x: [...facialRig.gazeBounds.x], y: [...facialRig.gazeBounds.y] },
    ...(facialRig.gazeBoundsByExpression ? {
      gazeBoundsByExpression: Object.fromEntries(Object.entries(facialRig.gazeBoundsByExpression).map(([partId, bounds]) => [partId, { x: [...bounds.x], y: [...bounds.y] }]))
    } : {}),
    ...(facialRig.aperturesByExpression ? {
      aperturesByExpression: Object.fromEntries(Object.entries(facialRig.aperturesByExpression).map(([partId, polygon]) => [partId, [...polygon]]))
    } : {}),
    linkedByDefault: facialRig.linkedByDefault
  };
}

function readFacialPointMapping(value: unknown): EditorFacialRig["irisOrigins"] | undefined {
  if (!isRecord(value)) return undefined;
  const readPoint = (point: unknown): readonly [number, number] | undefined => Array.isArray(point)
    && point.length === 2
    && point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? [point[0] as number, point[1] as number]
    : undefined;
  const left = readPoint(value.left);
  const right = readPoint(value.right);
  return left && right ? { left, right } : undefined;
}

function readFacialSideMapping(value: unknown): EditorFacialRig["expressionSlots"] | undefined {
  if (!isRecord(value)) return undefined;
  const left = stringValue(value.left);
  const right = stringValue(value.right);
  return left && right && left !== right ? { left, right } : undefined;
}

function readFacialGazeBounds(value: unknown): EditorFacialRig["gazeBounds"] | undefined {
  if (!isRecord(value)) return undefined;
  const x = readFiniteNumberPair(value.x);
  const y = readFiniteNumberPair(value.y);
  if (!x || !y || x[0] > x[1] || y[0] > y[1] || x[0] > 0 || x[1] < 0 || y[0] > 0 || y[1] < 0) return undefined;
  return { x, y };
}

function readFacialGazeBoundsByExpression(
  value: unknown,
  expressionPartIds: ReadonlySet<string>
): EditorFacialRig["gazeBoundsByExpression"] | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).map(([partId, bounds]) => [partId, readFacialGazeBounds(bounds)] as const);
  if (entries.some(([partId, bounds]) => !expressionPartIds.has(partId) || !bounds)) return undefined;
  return Object.fromEntries(entries) as NonNullable<EditorFacialRig["gazeBoundsByExpression"]>;
}

function readFacialAperturesByExpression(
  value: unknown,
  expressionPartIds: ReadonlySet<string>
): EditorFacialRig["aperturesByExpression"] | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length !== expressionPartIds.size || entries.some(([partId, polygon]) => !expressionPartIds.has(partId)
    || !Array.isArray(polygon)
    || (polygon.length !== 0 && (polygon.length < 6 || polygon.length % 2 !== 0))
    || polygon.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate)))) return undefined;
  return Object.fromEntries(entries.map(([partId, polygon]) => [partId, [...polygon as number[]]]));
}

function readFiniteNumberPair(value: unknown): readonly [number, number] | undefined {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && Number.isFinite(value[0]) && typeof value[1] === "number" && Number.isFinite(value[1])
    ? [value[0], value[1]]
    : undefined;
}

function readEditorIkChains(value: unknown, bones: Readonly<Record<string, BoneTransform>>): Readonly<Record<string, EditorIkChain>> {
  if (!Array.isArray(value)) return createDefaultEditorIkChains(bones);
  const chains = value.flatMap((item): EditorIkChain[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const id = stringValue(source.id);
    const name = stringValue(source.name);
    const rootBoneId = stringValue(source.rootBoneId);
    const middleBoneId = stringValue(source.middleBoneId);
    const endBoneId = stringValue(source.endBoneId);
    if (!id || !name || !rootBoneId || !middleBoneId || !endBoneId || !bones[rootBoneId] || !bones[middleBoneId] || !bones[endBoneId]) return [];
    return [{
      id,
      name,
      rootBoneId,
      middleBoneId,
      endBoneId,
      bendDirection: source.bendDirection === -1 ? -1 : 1,
      poleAngle: typeof source.poleAngle === "number" ? source.poleAngle : 0,
      stretch: source.stretch === true
    }];
  });
  return Object.fromEntries(chains.map((chain) => [chain.id, chain]));
}

function toSourceBone(project: EditorProjectState, boneId: string): BoneDefinition {
  const metadata = project.boneMetadata[boneId];
  return {
    id: boneId,
    name: boneId,
    ...(project.parents[boneId] ? { parentId: project.parents[boneId] ?? undefined } : {}),
    local: toTransform(project.bones[boneId] ?? identityTransform()),
    ...(project.boneLengths[boneId] !== undefined ? { length: project.boneLengths[boneId] } : {}),
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
      ...(part.intrinsicSize ? { intrinsicSize: [...part.intrinsicSize] } : {}),
      ...(part.aspectLocked !== undefined ? { aspectLocked: part.aspectLocked } : {}),
      width: part.width ?? null,
      anchor: part.anchor ? [...part.anchor] : null,
      offset: part.offset ? [...part.offset] : null,
      rotation: part.rotation ?? null,
      scale: part.scale ? [...part.scale] : null,
      opacity: part.opacity ?? null,
      assetPath: part.assetPath ?? null
    }
  };

  const exportedType = part.mesh ? "mesh" : part.pathCommands ? "path" : part.type;
  return {
    id: part.id,
    name: part.id,
    boneId: part.boneId,
    type: exportedType,
    drawOrder: part.zIndex ?? 0,
    opacity: part.opacity ?? 1,
    local: partLocalTransform(part),
    fill: { type: "solid", color: "#050505", alpha: 1 },
    ...(exportedType === "path" ? { path: { closed: true, commands: part.pathCommands ?? pointsToPath(part.points) } } : {}),
    ...(exportedType === "procedural" ? { procedural: { preset: part.preset ?? "organic-blob" } } : {}),
    ...(exportedType === "mesh" && part.mesh ? { mesh: part.mesh } : {}),
    ...(exportedType === "svg" ? { svg: { source: part.assetPath ?? part.id } } : {}),
    editor
  };
}

function fromSourcePart(part: PartDefinition): ShapePart {
  const custom = part.editor?.custom;
  const assetPath = stringValue(custom?.assetPath) ?? part.svg?.source ?? part.mesh?.texture;
  const width = numberValue(custom?.width);
  const anchor = readNumberPair(custom?.anchor);
  const offset = readNumberPair(custom?.offset);
  const scale = readNumberPair(custom?.scale);
  const rotation = numberValue(custom?.rotation) ?? part.local?.rotation ?? part.transform?.rotation;
  const opacity = numberValue(custom?.opacity) ?? part.opacity;
  const svgViewBox = readViewBox(custom?.svgViewBox);
  const intrinsicSize = readPositiveSize(custom?.intrinsicSize);
  const aspectLocked = booleanValue(custom?.aspectLocked);
  const pathCommands = readPathCommands(custom?.pathCommands) ?? part.path?.commands;
  return {
    id: part.id,
    boneId: part.boneId,
    type: part.type,
    pivot: readNumberPair(custom?.pivot) ?? [0, 0],
    points: readPointList(custom?.points) ?? pathToPoints(part.path?.commands ?? []),
    ...(pathCommands ? { pathCommands } : {}),
    ...(part.mesh ? { mesh: part.mesh } : {}),
    preset: part.procedural?.preset === "tapered-limb" || part.procedural?.preset === "organic-blob" || part.procedural?.preset === "capsule" ? part.procedural.preset : undefined,
    ...(assetPath ? { assetPath } : {}),
    ...(svgViewBox ? { svgViewBox } : {}),
    ...(intrinsicSize ? { intrinsicSize } : {}),
    ...(aspectLocked !== undefined ? { aspectLocked } : {}),
    ...(width ? { width } : {}),
    ...(anchor ? { anchor } : {}),
    ...(offset ? { offset } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(scale ? { scale } : part.local ? { scale: [part.local.scaleX, part.local.scaleY] as const } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
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
    tracks: Object.entries(clip.tracks)
      .filter(([, keyframes]) => keyframes.length > 0)
      .map(([trackId, keyframes]) => toSourceTrack(trackId, keyframes)),
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
    tracks: Object.fromEntries(clip.tracks.map((track) => [fromTrackId(track), fromSourceKeyframes(track.keyframes)])),
    events: (clip.events ?? []).map((event, index) => ({ id: `${clip.id}-event-${index}`, ...event })),
    markers: clip.markers ?? [],
    tags: clip.tags ?? []
  };
}

function toSourceTrack(trackId: string, keyframes: readonly Keyframe[]): AnimationTrack {
  const splitIndex = trackId.lastIndexOf(".");
  const targetId = splitIndex > 0 ? trackId.slice(0, splitIndex) : trackId;
  const property = splitIndex > 0 ? trackId.slice(splitIndex + 1) : "x";
  const target = parseTrackTarget(targetId, property);
  return {
    id: trackId,
    target,
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
  const prefix = track.target.kind === "bone" ? track.target.id : `${track.target.kind}:${track.target.id}`;
  return `${prefix}.${property}`;
}

function fromSourceKeyframe(keyframe: SourceAnimationClip["tracks"][number]["keyframes"][number]): Keyframe {
  const curvePreset = readCurvePreset(keyframe.editor?.custom?.curvePreset);
  const tangentIn = numberValue(keyframe.editor?.custom?.tangentIn);
  const tangentOut = numberValue(keyframe.editor?.custom?.tangentOut);
  return {
    id: stringValue(keyframe.editor?.custom?.id) ?? `key-${keyframe.time}`,
    time: keyframe.time,
    value: keyframe.value,
    interpolation: keyframe.interpolation ?? "linear",
    ...(keyframe.curve ? { curve: keyframe.curve } : {}),
    ...(curvePreset ? { curvePreset } : {}),
    ...(tangentIn !== undefined ? { tangentIn } : {}),
    ...(tangentOut !== undefined ? { tangentOut } : {})
  };
}

function fromSourceKeyframes(keyframes: SourceAnimationClip["tracks"][number]["keyframes"]): readonly Keyframe[] {
  const usedIds = new Map<string, number>();
  return keyframes.map((keyframe) => {
    const restored = fromSourceKeyframe(keyframe);
    const occurrence = (usedIds.get(restored.id) ?? 0) + 1;
    usedIds.set(restored.id, occurrence);
    return occurrence === 1 ? restored : { ...restored, id: `${restored.id}-${occurrence}` };
  });
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
    ...(transition.interruptWindow ? { interruptWindow: transition.interruptWindow } : {}),
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
  if (property === "skewX") {
    return "transform.skewX";
  }
  if (property === "skewY") {
    return "transform.skewY";
  }
  if (property === "visible" || property === "opacity" || property === "drawOrder" || property === "deform" || property === "attachment") {
    return property;
  }
  return "transform.x";
}

function parseTrackTarget(value: string, property?: string): AnimationTrack["target"] {
  const splitIndex = value.indexOf(":");
  if (splitIndex > 0) {
    const kind = value.slice(0, splitIndex);
    if (isTrackTargetKind(kind)) {
      return { kind, id: value.slice(splitIndex + 1) };
    }
  }
  if (property === "visible" || property === "opacity" || property === "drawOrder" || property === "deform") {
    return { kind: "part", id: value };
  }
  return { kind: "bone", id: value };
}

function isTrackTargetKind(value: string): value is AnimationTrackTargetKind {
  return value === "bone" || value === "part" || value === "slot" || value === "project" || value === "stateMachine";
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

export function partLocalTransform(part: ShapePart): Transform2D {
  const offset = part.offset ?? [0, 0];
  const explicitScale = part.scale;
  if (!part.svgViewBox || !part.width) {
    return { x: offset[0], y: offset[1], rotation: part.rotation ?? 0, scaleX: explicitScale?.[0] ?? 1, scaleY: explicitScale?.[1] ?? 1 };
  }
  const [, , width, height] = part.svgViewBox;
  const fittedScale = width > 0 ? part.width / width : 1;
  const anchor = part.anchor ?? [0, 0];
  const scaleX = (explicitScale?.[0] ?? 1) * fittedScale;
  const scaleY = (explicitScale?.[1] ?? 1) * fittedScale;
  return {
    x: offset[0] - anchor[0] * width * scaleX,
    y: offset[1] - anchor[1] * height * scaleY,
    rotation: part.rotation ?? 0,
    scaleX,
    scaleY
  };
}

function proceduralToJson(procedural: ProceduralPresetState) {
  return {
    inputs: { ...procedural.inputs },
    breathing: {
      enabled: procedural.breathing.enabled,
      frequency: procedural.breathing.frequency,
      amplitude: procedural.breathing.amplitude,
      affectedBones: Object.keys(procedural.breathing.affectedBoneTransforms),
      affectedBoneTransforms: boneTransformPatchesToJson(procedural.breathing.affectedBoneTransforms)
    },
    secondaryMotion: {
      enabled: procedural.secondaryMotion.enabled,
      target: procedural.secondaryMotion.target,
      stiffness: procedural.secondaryMotion.stiffness,
      damping: procedural.secondaryMotion.damping,
      velocityInfluence: procedural.secondaryMotion.velocityInfluence,
      gravityInfluence: procedural.secondaryMotion.gravityInfluence,
      windInfluence: procedural.secondaryMotion.windInfluence,
      maxOffset: procedural.secondaryMotion.maxOffset
    },
    squashStretch: {
      enabled: procedural.squashStretch.enabled,
      targetBone: procedural.squashStretch.targetBone,
      landingImpactScale: procedural.squashStretch.landingImpactScale,
      rules: procedural.squashStretch.rules.map((rule) => ({ ...rule }))
    },
    footIk: {
      enabled: procedural.footIk.enabled,
      feet: [...procedural.footIk.feet],
      footChains: procedural.footIk.footChains.map((chain) => ({
        footBone: chain.footBone,
        ...(chain.shinBone ? { shinBone: chain.shinBone } : {}),
        ...(chain.thighBone ? { thighBone: chain.thighBone } : {}),
        raycastOffsetX: chain.raycastOffsetX,
        raycastHeight: chain.raycastHeight
      })),
      maxCorrection: procedural.footIk.maxCorrection,
      blend: procedural.footIk.blend
    }
  };
}

function boneTransformPatchesToJson(transforms: ProceduralPresetState["breathing"]["affectedBoneTransforms"]): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(transforms).map(([boneId, transform]) => [
      boneId,
      Object.fromEntries(Object.entries(transform).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
    ])
  );
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
    procedural: [...dirtyScopes.procedural],
    preview: [...dirtyScopes.preview]
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

function topologyToJson(topology: EditorRigTopology) {
  return {
    joints: Object.values(topology.joints).map((joint) => ({ ...joint })),
    segments: Object.values(topology.segments).map((segment) => ({ ...segment })),
    groups: Object.values(topology.groups).map((group) => ({ ...group, boneIds: [...group.boneIds] })),
    activeGroupId: topology.activeGroupId
  };
}

function readEditorTopology(value: unknown, hierarchy: readonly string[], parents: Readonly<Record<string, string | null>>): EditorRigTopology {
  if (!isRecord(value)) return createEditorTopology(hierarchy, parents);
  const fallback = createEditorTopology(hierarchy, parents);
  const groups = Array.isArray(value.groups)
    ? value.groups.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = stringValue(item.id);
        const name = stringValue(item.name);
        if (!id || !name) return [];
        return [{ id, name, boneIds: (readStringArray(item.boneIds) ?? []).filter((boneId) => hierarchy.includes(boneId)), ...(item.locked === true ? { locked: true } : {}), ...(item.hidden === true ? { hidden: true } : {}) }];
      })
    : Object.values(fallback.groups);
  const topology = createEditorTopology(hierarchy, parents, groups.length ? groups : Object.values(fallback.groups));
  const joints = Array.isArray(value.joints)
    ? Object.fromEntries(value.joints.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = stringValue(item.id);
        const boneId = stringValue(item.boneId);
        if (!id || !boneId || !hierarchy.includes(boneId)) return [];
        return [[id, { id, boneId, name: stringValue(item.name) ?? boneId }]];
      }))
    : topology.joints;
  const segments = Array.isArray(value.segments)
    ? Object.fromEntries(value.segments.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = stringValue(item.id);
        const startJointId = stringValue(item.startJointId);
        const endJointId = stringValue(item.endJointId);
        const boneId = stringValue(item.boneId);
        const groupId = stringValue(item.groupId);
        if (!id || !startJointId || !endJointId || !boneId || !groupId || !joints[startJointId] || !joints[endJointId] || !topology.groups[groupId]) return [];
        return [[id, { id, startJointId, endJointId, boneId, groupId, name: stringValue(item.name) ?? boneId }]];
      }))
    : topology.segments;
  const activeGroupId = stringValue(value.activeGroupId);
  return { ...topology, joints, segments, activeGroupId: activeGroupId && topology.groups[activeGroupId] ? activeGroupId : topology.activeGroupId };
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
  const breathingValue = isRecord(value.breathing) ? value.breathing : undefined;
  const affectedBoneTransforms = readBoneTransformPatches(breathingValue?.affectedBoneTransforms);
  return {
    inputs: isRecord(value.inputs) ? { ...initialEditorProject.procedural.inputs, ...value.inputs } : initialEditorProject.procedural.inputs,
    breathing: breathingValue ? {
      enabled: breathingValue.enabled === true,
      frequency: numberValue(breathingValue.frequency) ?? initialEditorProject.procedural.breathing.frequency,
      amplitude: numberValue(breathingValue.amplitude) ?? initialEditorProject.procedural.breathing.amplitude,
      affectedBones: Object.keys(affectedBoneTransforms),
      affectedBoneTransforms
    } : initialEditorProject.procedural.breathing,
    secondaryMotion: isRecord(value.secondaryMotion) ? { ...initialEditorProject.procedural.secondaryMotion, ...value.secondaryMotion } : initialEditorProject.procedural.secondaryMotion,
    squashStretch: isRecord(value.squashStretch) ? { ...initialEditorProject.procedural.squashStretch, ...value.squashStretch } : initialEditorProject.procedural.squashStretch,
    footIk: isRecord(value.footIk) ? { ...initialEditorProject.procedural.footIk, ...value.footIk } : initialEditorProject.procedural.footIk
  };
}

function readBoneTransformPatches(value: unknown): ProceduralPresetState["breathing"]["affectedBoneTransforms"] {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([boneId, patch]) => {
    if (!isRecord(patch)) return [];
    const transform = Object.fromEntries(["x", "y", "rotation", "scaleX", "scaleY"].flatMap((property) => {
      const amount = numberValue(patch[property]);
      return amount === undefined ? [] : [[property, amount]];
    }));
    return [[boneId, transform]];
  }));
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
    procedural: readStringArray(value.procedural) ?? [],
    preview: readStringArray(value.preview) ?? []
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

function readPositiveSize(value: unknown): readonly [number, number] | undefined {
  const pair = readNumberPair(value);
  return pair && pair[0] > 0 && pair[1] > 0 ? pair : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

function readCharacterKind(value: unknown): CharacterKind {
  return value === "dog" || value === "cat" ? value : "human";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
