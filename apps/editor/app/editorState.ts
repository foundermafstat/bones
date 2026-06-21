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
  dirty: false,
  dirtyParts: [],
  bones: {
    root: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    body: { x: 0, y: -36, rotation: 0, scaleX: 1, scaleY: 1 },
    head: { x: 0, y: -32, rotation: 0, scaleX: 1, scaleY: 1 }
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

function updateBone(state: EditorProjectState, boneId: string, updater: (bone: BoneTransform) => BoneTransform): EditorProjectState {
  const current = state.bones[boneId];
  if (!current) {
    return state;
  }
  return {
    ...state,
    dirty: true,
    dirtyParts: state.dirtyParts.includes(boneId) ? state.dirtyParts : [...state.dirtyParts, boneId],
    bones: {
      ...state.bones,
      [boneId]: updater(current)
    }
  };
}
