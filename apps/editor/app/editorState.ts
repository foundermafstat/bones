export interface BoneTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface EditorProjectState {
  readonly name: string;
  readonly selectedBoneId: string;
  readonly hierarchy: readonly string[];
  readonly parents: Readonly<Record<string, string | null>>;
  readonly bones: Readonly<Record<string, BoneTransform>>;
  readonly parts: Readonly<Record<string, ShapePart>>;
  readonly poses: Readonly<Record<string, PoseDefinition>>;
  readonly animations: Readonly<Record<string, AnimationClip>>;
  readonly dirty: boolean;
  readonly dirtyParts: readonly string[];
}

export interface ShapePart {
  readonly id: string;
  readonly boneId: string;
  readonly type: "procedural" | "path";
  readonly pivot: readonly [number, number];
  readonly points: readonly (readonly [number, number])[];
  readonly preset: "tapered-limb" | "organic-blob" | "capsule" | undefined;
}

export interface PoseDefinition {
  readonly id: string;
  readonly name: string;
  readonly boneTransforms: Readonly<Record<string, BoneTransform>>;
  readonly tags: readonly string[];
}

export interface AnimationClip {
  readonly id: string;
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: Readonly<Record<string, readonly Keyframe[]>>;
}

export interface Keyframe {
  readonly id: string;
  readonly time: number;
  readonly value: number;
  readonly interpolation: "linear" | "step" | "hold" | "bezier";
}

export interface EditorCommand {
  readonly id: string;
  readonly label: string;
  do(state: EditorProjectState): EditorProjectState;
  undo(state: EditorProjectState): EditorProjectState;
}

export interface CommandHistory {
  readonly past: readonly EditorCommand[];
  readonly future: readonly EditorCommand[];
}

export interface EditorStateContainer {
  readonly project: EditorProjectState;
  readonly history: CommandHistory;
}

export const initialEditorProject: EditorProjectState = {
  name: "Shadow Hero",
  selectedBoneId: "body",
  hierarchy: ["root", "body", "head", "upperArmFront", "forearmFront", "handFront", "thighFront", "shinFront", "footFront", "cloak"],
  parents: {
    root: null,
    body: "root",
    head: "body",
    upperArmFront: "body",
    forearmFront: "upperArmFront",
    handFront: "forearmFront",
    thighFront: "root",
    shinFront: "thighFront",
    footFront: "shinFront",
    cloak: "body"
  },
  dirty: false,
  dirtyParts: [],
  bones: {
    root: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    body: { x: 0, y: -36, rotation: 0, scaleX: 1, scaleY: 1 },
    head: { x: 0, y: -32, rotation: 0, scaleX: 1, scaleY: 1 },
    upperArmFront: { x: 12, y: -20, rotation: 0.45, scaleX: 1, scaleY: 1 },
    forearmFront: { x: 20, y: 0, rotation: 0.35, scaleX: 1, scaleY: 1 },
    handFront: { x: 18, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    thighFront: { x: 7, y: -4, rotation: 1.65, scaleX: 1, scaleY: 1 },
    shinFront: { x: 24, y: 0, rotation: 0.18, scaleX: 1, scaleY: 1 },
    footFront: { x: 22, y: 0, rotation: -1.1, scaleX: 1, scaleY: 1 },
    cloak: { x: 0, y: -26, rotation: 0, scaleX: 1, scaleY: 1 }
  },
  parts: {
    bodyShape: { id: "bodyShape", boneId: "body", type: "procedural", pivot: [0, 0], points: [], preset: "organic-blob" },
    armShape: { id: "armShape", boneId: "upperArmFront", type: "procedural", pivot: [0, 0], points: [], preset: "tapered-limb" }
  },
  poses: {
    idle_neutral: { id: "idle_neutral", name: "Idle neutral", boneTransforms: {}, tags: ["idle"] },
    breath_in: { id: "breath_in", name: "Breath in", boneTransforms: { body: { x: 0, y: -37, rotation: 0, scaleX: 1, scaleY: 1.025 } }, tags: ["idle"] },
    walk_contact: { id: "walk_contact", name: "Walk contact", boneTransforms: { thighFront: { x: 7, y: -4, rotation: 1.25, scaleX: 1, scaleY: 1 } }, tags: ["walk"] },
    jump_peak: { id: "jump_peak", name: "Jump peak", boneTransforms: { body: { x: 0, y: -44, rotation: -0.04, scaleX: 1, scaleY: 1.04 } }, tags: ["jump"] },
    land_heavy: { id: "land_heavy", name: "Land heavy", boneTransforms: { body: { x: 0, y: -33, rotation: 0, scaleX: 1.14, scaleY: 0.82 } }, tags: ["land"] }
  },
  animations: {
    idle: { id: "idle", duration: 1.2, loop: true, tracks: { "body.scaleY": [{ id: "idle-0", time: 0, value: 1, interpolation: "bezier" }] } },
    walk: { id: "walk", duration: 0.72, loop: true, tracks: { "thighFront.rotation": [{ id: "walk-0", time: 0, value: 1.25, interpolation: "linear" }] } },
    jump: { id: "jump", duration: 0.3, loop: false, tracks: {} }
  }
};

export function executeCommand(container: EditorStateContainer, command: EditorCommand): EditorStateContainer {
  return {
    project: command.do(container.project),
    history: { past: [...container.history.past, command], future: [] }
  };
}

export function undo(container: EditorStateContainer): EditorStateContainer {
  const command = container.history.past[container.history.past.length - 1];
  if (!command) {
    return container;
  }
  return {
    project: command.undo(container.project),
    history: {
      past: container.history.past.slice(0, -1),
      future: [command, ...container.history.future]
    }
  };
}

export function redo(container: EditorStateContainer): EditorStateContainer {
  const command = container.history.future[0];
  if (!command) {
    return container;
  }
  return {
    project: command.do(container.project),
    history: {
      past: [...container.history.past, command],
      future: container.history.future.slice(1)
    }
  };
}

export function createMoveBoneCommand(boneId: string, dx: number, dy: number): EditorCommand {
  return {
    id: `move:${boneId}:${dx}:${dy}`,
    label: "Move bone",
    do: (state) => updateBone(state, boneId, (bone) => ({ ...bone, x: bone.x + dx, y: bone.y + dy })),
    undo: (state) => updateBone(state, boneId, (bone) => ({ ...bone, x: bone.x - dx, y: bone.y - dy }))
  };
}

export function createRotateBoneCommand(boneId: string, delta: number): EditorCommand {
  return {
    id: `rotate:${boneId}:${delta}`,
    label: "Rotate bone",
    do: (state) => updateBone(state, boneId, (bone) => ({ ...bone, rotation: bone.rotation + delta })),
    undo: (state) => updateBone(state, boneId, (bone) => ({ ...bone, rotation: bone.rotation - delta }))
  };
}

export function createAddBoneCommand(parentId: string, boneId: string): EditorCommand {
  const transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  return {
    id: `add-bone:${parentId}:${boneId}`,
    label: "Add bone",
    do: (state) => ({
      ...markDirty(state, boneId),
      selectedBoneId: boneId,
      hierarchy: state.hierarchy.includes(boneId) ? state.hierarchy : [...state.hierarchy, boneId],
      parents: { ...state.parents, [boneId]: parentId },
      bones: { ...state.bones, [boneId]: transform }
    }),
    undo: (state) => removeBone(state, boneId, parentId)
  };
}

export function createDeleteBoneCommand(boneId: string): EditorCommand {
  return {
    id: `delete-bone:${boneId}`,
    label: "Delete bone",
    do: (state) => removeBone(state, boneId, state.parents[boneId] ?? "root"),
    undo: (state) => ({
      ...markDirty(state, boneId),
      hierarchy: state.hierarchy.includes(boneId) ? state.hierarchy : [...state.hierarchy, boneId],
      parents: { ...state.parents, [boneId]: state.parents[boneId] ?? "root" },
      bones: { ...state.bones, [boneId]: state.bones[boneId] ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }
    })
  };
}

export function createRenameBoneCommand(boneId: string, nextId: string): EditorCommand {
  return {
    id: `rename-bone:${boneId}:${nextId}`,
    label: "Rename bone",
    do: (state) => renameBone(state, boneId, nextId),
    undo: (state) => renameBone(state, nextId, boneId)
  };
}

export function createSetParentCommand(boneId: string, parentId: string | null): EditorCommand {
  return {
    id: `set-parent:${boneId}:${parentId ?? "root"}`,
    label: "Set parent",
    do: (state) => ({ ...markDirty(state, boneId), parents: { ...state.parents, [boneId]: parentId } }),
    undo: (state) => ({ ...markDirty(state, boneId), parents: { ...state.parents, [boneId]: state.parents[boneId] ?? null } })
  };
}

export function createBindProceduralPartCommand(partId: string, boneId: string, preset: ShapePart["preset"]): EditorCommand {
  return {
    id: `bind-part:${partId}:${boneId}`,
    label: "Bind procedural part",
    do: (state) => ({
      ...markDirty(state, partId),
      parts: { ...state.parts, [partId]: { id: partId, boneId, type: "procedural", pivot: [0, 0], points: [], preset } }
    }),
    undo: (state) => {
      const { [partId]: _removed, ...parts } = state.parts;
      return { ...markDirty(state, partId), parts };
    }
  };
}

export function createEditPathPointCommand(partId: string, index: number, point: readonly [number, number]): EditorCommand {
  const update = (state: EditorProjectState, nextPoint: readonly [number, number] | undefined) => {
    const part = state.parts[partId];
    if (!part) {
      return state;
    }
    const points = [...part.points];
    if (nextPoint) {
      points[index] = nextPoint;
    } else {
      points.splice(index, 1);
    }
    const nextPart: ShapePart = { ...part, type: "path", points };
    return { ...markDirty(state, partId), parts: { ...state.parts, [partId]: nextPart } };
  };
  return {
    id: `edit-point:${partId}:${index}`,
    label: "Edit path point",
    do: (state) => update(state, point),
    undo: (state) => update(state, state.parts[partId]?.points[index])
  };
}

export function createMirrorPathCommand(partId: string): EditorCommand {
  const mirror = (state: EditorProjectState) => {
    const part = state.parts[partId];
    return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, points: part.points.map(([x, y]) => [-x, y] as const) } } } : state;
  };
  return { id: `mirror-path:${partId}`, label: "Mirror path", do: mirror, undo: mirror };
}

export function createSetPartPivotCommand(partId: string, pivot: readonly [number, number]): EditorCommand {
  return {
    id: `set-pivot:${partId}:${pivot.join(",")}`,
    label: "Set pivot",
    do: (state) => {
      const part = state.parts[partId];
      return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, pivot } } } : state;
    },
    undo: (state) => {
      const part = state.parts[partId];
      return part ? { ...markDirty(state, partId), parts: { ...state.parts, [partId]: { ...part, pivot: [0, 0] } } } : state;
    }
  };
}

export function createApplyPoseCommand(poseId: string): EditorCommand {
  let previous: Readonly<Record<string, BoneTransform>> = {};
  return {
    id: `apply-pose:${poseId}`,
    label: "Apply pose",
    do: (state) => {
      const pose = state.poses[poseId];
      if (!pose) {
        return state;
      }
      previous = Object.fromEntries(
        Object.keys(pose.boneTransforms)
          .map((boneId): [string, BoneTransform | undefined] => [boneId, state.bones[boneId]])
          .filter((entry): entry is [string, BoneTransform] => Boolean(entry[1]))
      );
      return {
        ...markDirty(state, poseId),
        bones: { ...state.bones, ...pose.boneTransforms }
      };
    },
    undo: (state) => ({ ...markDirty(state, poseId), bones: { ...state.bones, ...previous } })
  };
}

export function createDuplicatePoseCommand(poseId: string, nextId: string): EditorCommand {
  return {
    id: `duplicate-pose:${poseId}:${nextId}`,
    label: "Duplicate pose",
    do: (state) => {
      const pose = state.poses[poseId];
      return pose ? { ...markDirty(state, nextId), poses: { ...state.poses, [nextId]: { ...pose, id: nextId, name: `${pose.name} Copy` } } } : state;
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId), poses };
    }
  };
}

export function createMirrorPoseCommand(poseId: string, nextId: string): EditorCommand {
  return {
    id: `mirror-pose:${poseId}:${nextId}`,
    label: "Mirror pose",
    do: (state) => {
      const pose = state.poses[poseId];
      if (!pose) {
        return state;
      }
      const boneTransforms = Object.fromEntries(Object.entries(pose.boneTransforms).map(([boneId, transform]) => [boneId, { ...transform, x: -transform.x, rotation: -transform.rotation }]));
      return { ...markDirty(state, nextId), poses: { ...state.poses, [nextId]: { ...pose, id: nextId, name: `${pose.name} Mirrored`, boneTransforms } } };
    },
    undo: (state) => {
      const { [nextId]: _removed, ...poses } = state.poses;
      return { ...markDirty(state, nextId), poses };
    }
  };
}

export function createAddKeyframeCommand(clipId: string, trackId: string, keyframe: Keyframe): EditorCommand {
  return {
    id: `add-key:${clipId}:${trackId}:${keyframe.id}`,
    label: "Add keyframe",
    do: (state) => updateClipTrack(state, clipId, trackId, (keys) => [...keys, keyframe].sort((a, b) => a.time - b.time)),
    undo: (state) => updateClipTrack(state, clipId, trackId, (keys) => keys.filter((key) => key.id !== keyframe.id))
  };
}

export function createDeleteKeyframeCommand(clipId: string, trackId: string, keyframeId: string): EditorCommand {
  let removed: Keyframe | undefined;
  return {
    id: `delete-key:${clipId}:${trackId}:${keyframeId}`,
    label: "Delete keyframe",
    do: (state) =>
      updateClipTrack(state, clipId, trackId, (keys) => {
        removed = keys.find((key) => key.id === keyframeId);
        return keys.filter((key) => key.id !== keyframeId);
      }),
    undo: (state) => (removed ? updateClipTrack(state, clipId, trackId, (keys) => [...keys, removed!].sort((a, b) => a.time - b.time)) : state)
  };
}

export function createMoveKeyframeCommand(clipId: string, trackId: string, keyframeId: string, nextTime: number): EditorCommand {
  let previousTime = 0;
  const move = (state: EditorProjectState, time: number) =>
    updateClipTrack(state, clipId, trackId, (keys) =>
      keys
        .map((key) => {
          if (key.id !== keyframeId) {
            return key;
          }
          previousTime = key.time;
          return { ...key, time };
        })
        .sort((a, b) => a.time - b.time)
    );
  return {
    id: `move-key:${clipId}:${trackId}:${keyframeId}`,
    label: "Move keyframe",
    do: (state) => move(state, nextTime),
    undo: (state) => move(state, previousTime)
  };
}

function updateBone(state: EditorProjectState, boneId: string, updater: (bone: BoneTransform) => BoneTransform): EditorProjectState {
  const current = state.bones[boneId];
  if (!current) {
    return state;
  }
  return {
    ...markDirty(state, boneId),
    bones: {
      ...state.bones,
      [boneId]: updater(current)
    }
  };
}

function markDirty(state: EditorProjectState, id: string): EditorProjectState {
  return {
    ...state,
    dirty: true,
    dirtyParts: state.dirtyParts.includes(id) ? state.dirtyParts : [...state.dirtyParts, id]
  };
}

function removeBone(state: EditorProjectState, boneId: string, fallbackSelection: string | null): EditorProjectState {
  const { [boneId]: _removedBone, ...bones } = state.bones;
  const { [boneId]: _removedParent, ...parents } = state.parents;
  return {
    ...markDirty(state, boneId),
    selectedBoneId: fallbackSelection ?? "root",
    hierarchy: state.hierarchy.filter((item) => item !== boneId),
    parents,
    bones
  };
}

function renameBone(state: EditorProjectState, boneId: string, nextId: string): EditorProjectState {
  const current = state.bones[boneId];
  if (!current || state.bones[nextId]) {
    return state;
  }
  const { [boneId]: _removedBone, ...bones } = state.bones;
  const { [boneId]: parent, ...parents } = state.parents;
  return {
    ...markDirty(state, nextId),
    selectedBoneId: state.selectedBoneId === boneId ? nextId : state.selectedBoneId,
    hierarchy: state.hierarchy.map((item) => (item === boneId ? nextId : item)),
    parents: Object.fromEntries(Object.entries({ ...parents, [nextId]: parent ?? null }).map(([child, value]) => [child, value === boneId ? nextId : value])),
    bones: { ...bones, [nextId]: current }
  };
}

function updateClipTrack(state: EditorProjectState, clipId: string, trackId: string, updater: (keys: readonly Keyframe[]) => readonly Keyframe[]): EditorProjectState {
  const clip = state.animations[clipId];
  if (!clip) {
    return state;
  }
  return {
    ...markDirty(state, clipId),
    animations: {
      ...state.animations,
      [clipId]: {
        ...clip,
        tracks: {
          ...clip.tracks,
          [trackId]: updater(clip.tracks[trackId] ?? [])
        }
      }
    }
  };
}
