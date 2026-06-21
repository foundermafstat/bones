import type { EditorProjectState } from "./editorState";
import { fromSourceProject, toSourceProject } from "./editorSourceProject";

export const EDITOR_DRAFT_KEY = "bones:editor:draft:v1";
export const CURRENT_EDITOR_SCHEMA_VERSION = "1.0.0";

export interface SerializedEditorProject {
  readonly schemaVersion: string;
  readonly savedAt: string;
  readonly project: EditorProjectState;
}

export function serializeEditorProject(project: EditorProjectState): string {
  return JSON.stringify(toSourceProject(project), null, 2);
}

export function parseEditorProject(json: string): EditorProjectState {
  const parsed = JSON.parse(json) as Partial<SerializedEditorProject> & Record<string, unknown>;
  if (parsed.project) {
    if (parsed.schemaVersion && parsed.schemaVersion !== CURRENT_EDITOR_SCHEMA_VERSION) {
      return migrateEditorProject(parsed);
    }
    return parsed.project;
  }
  return fromSourceProject(parsed);
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
