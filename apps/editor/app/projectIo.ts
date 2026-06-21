import type { EditorProjectState } from "./editorState";

export const EDITOR_DRAFT_KEY = "bones:editor:draft:v1";
export const CURRENT_EDITOR_SCHEMA_VERSION = "1.0.0";

export interface SerializedEditorProject {
  readonly schemaVersion: string;
  readonly savedAt: string;
  readonly project: EditorProjectState;
}

export function serializeEditorProject(project: EditorProjectState): string {
  return JSON.stringify({ schemaVersion: CURRENT_EDITOR_SCHEMA_VERSION, savedAt: new Date().toISOString(), project } satisfies SerializedEditorProject, null, 2);
}

export function parseEditorProject(json: string): EditorProjectState {
  const parsed = JSON.parse(json) as Partial<SerializedEditorProject>;
  if (!parsed.project) {
    throw new Error("Editor project JSON is missing project data.");
  }
  if (parsed.schemaVersion && parsed.schemaVersion !== CURRENT_EDITOR_SCHEMA_VERSION) {
    return migrateEditorProject(parsed);
  }
  return parsed.project;
}

export function saveDraft(project: EditorProjectState, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  storage.setItem(EDITOR_DRAFT_KEY, serializeEditorProject(project));
}

export function loadDraft(storage: Pick<Storage, "getItem"> = window.localStorage): EditorProjectState | undefined {
  const value = storage.getItem(EDITOR_DRAFT_KEY);
  return value ? parseEditorProject(value) : undefined;
}

function migrateEditorProject(serialized: Partial<SerializedEditorProject>): EditorProjectState {
  if (!serialized.project) {
    throw new Error("Cannot migrate missing editor project.");
  }
  return serialized.project;
}
