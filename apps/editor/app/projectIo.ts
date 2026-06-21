import type { EditorProjectState } from "./editorState";
import { initialEditorProject } from "./editorState";
import { fromSourceProject, toSourceProject } from "./editorSourceProject";
import { compileRig } from "@bones/compiler";

export const EDITOR_DRAFT_KEY = "bones:editor:draft:v1";
export const CURRENT_EDITOR_SCHEMA_VERSION = "1.0.0";

export interface SerializedEditorProject {
  readonly schemaVersion: string;
  readonly savedAt: string;
  readonly project: EditorProjectState;
}

export interface ProjectExportBundle {
  readonly files: Readonly<Record<string, string>>;
  readonly validation: { readonly ok: boolean; readonly errors: readonly string[] };
}

export interface ProjectImportResult {
  readonly project?: EditorProjectState;
  readonly errors: readonly string[];
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
    return normalizeEditorProject(parsed.project);
  }
  return fromSourceProject(parsed);
}

export function parseImportedProject(json: string): ProjectImportResult {
  try {
    return { project: parseEditorProject(json), errors: [] };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : "Unknown import error"] };
  }
}

export function createProjectExportBundle(project: EditorProjectState): ProjectExportBundle {
  try {
    const source = toSourceProject(project);
    const compiled = compileRig(source);
    return {
      files: {
        "hero.source.rig.json": JSON.stringify(source, null, 2),
        "hero.rig.json": JSON.stringify({ schemaVersion: source.schemaVersion, runtimeTarget: source.runtimeTarget, rigs: source.rigs }, null, 2),
        "hero.animations.json": JSON.stringify({ schemaVersion: source.schemaVersion, animations: source.animations, poses: source.poses }, null, 2),
        "hero.state-machine.json": JSON.stringify({ schemaVersion: source.schemaVersion, stateMachines: source.stateMachines, proceduralPresets: source.proceduralPresets }, null, 2),
        "hero.compiled.json": JSON.stringify(compiled, null, 2)
      },
      validation: { ok: true, errors: [] }
    };
  } catch (error) {
    return {
      files: {},
      validation: { ok: false, errors: [error instanceof Error ? error.message : "Unknown export error"] }
    };
  }
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
  return normalizeEditorProject(serialized.project);
}

function normalizeEditorProject(project: EditorProjectState): EditorProjectState {
  return {
    ...initialEditorProject,
    ...project,
    poseClipboard: project.poseClipboard ?? null,
    timeline: project.timeline ?? initialEditorProject.timeline,
    stateMachine: { ...initialEditorProject.stateMachine, ...project.stateMachine, preview: project.stateMachine.preview ?? initialEditorProject.stateMachine.preview },
    dirtyScopes: project.dirtyScopes ?? initialEditorProject.dirtyScopes,
    autosave: project.autosave ?? initialEditorProject.autosave
  };
}
