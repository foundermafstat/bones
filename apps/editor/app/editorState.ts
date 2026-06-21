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
  readonly dirty: boolean;
  readonly dirtyParts: readonly string[];
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
