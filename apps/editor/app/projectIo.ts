import type { EditorProjectState } from "./editorState";
import { initialEditorProject } from "./editorState";
import { fromSourceProject, toSourceProject } from "./editorSourceProject";
import { vectorizeSvgParts } from "./editorVectorImport";
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
  readonly validation: { readonly ok: boolean; readonly errors: readonly string[]; readonly warnings: readonly string[] };
}

export interface ProjectImportResult {
  readonly project?: EditorProjectState;
  readonly errors: readonly string[];
  readonly kind?: "source" | "legacy-wrapper";
  readonly summary?: string;
}

export function serializeEditorProject(project: EditorProjectState): string {
  return JSON.stringify(toSourceProject(project), null, 2);
}

export function parseEditorProject(json: string): EditorProjectState {
  const parsed = JSON.parse(json) as Partial<SerializedEditorProject> & Record<string, unknown>;
  if (parsed.project) {
    if (parsed.schemaVersion && parsed.schemaVersion !== CURRENT_EDITOR_SCHEMA_VERSION) {
      throw new Error(`$.schemaVersion: Unsupported editor schemaVersion ${String(parsed.schemaVersion)}.`);
    }
    return normalizeEditorProject(parsed.project);
  }
  return fromSourceProject(parsed);
}

export function parseImportedProject(json: string): ProjectImportResult {
  try {
    const parsed = JSON.parse(json) as Partial<SerializedEditorProject> & Record<string, unknown>;
    const kind = parsed.project ? "legacy-wrapper" : "source";
    if (parsed.project && parsed.schemaVersion && parsed.schemaVersion !== CURRENT_EDITOR_SCHEMA_VERSION) {
      return { errors: [`$.schemaVersion: Unsupported editor schemaVersion ${String(parsed.schemaVersion)}.`], kind };
    }
    const project = parseEditorProject(json);
    return { project, errors: [], kind, summary: summarizeImport(project, kind) };
  } catch (error) {
    const message = error instanceof SyntaxError ? `Malformed JSON: ${error.message}` : error instanceof Error ? error.message : "Unknown import error";
    return { errors: [message] };
  }
}

export async function createProjectExportBundle(project: EditorProjectState, loadText?: (assetPath: string) => Promise<string>): Promise<ProjectExportBundle> {
  try {
    const inputSvgParts = Object.values(project.parts).filter((part) => part.type === "svg").map((part) => part.id);
    const vectorProject = await vectorizeSvgParts(project, loadText);
    const source = toSourceProject(vectorProject);
    const compiled = compileRig(source);
    const svgParts = source.rigs.flatMap((rig) => (rig.parts ?? []).filter((part) => part.type === "svg").map((part) => part.id));
    if (svgParts.length) {
      throw new Error(`Production export still contains SVG parts: ${svgParts.join(", ")}.`);
    }
    return {
      files: {
        "hero.source.rig.json": JSON.stringify(source, null, 2),
        "hero.rig.json": JSON.stringify({ schemaVersion: source.schemaVersion, runtimeTarget: source.runtimeTarget, rigs: source.rigs }, null, 2),
        "hero.animations.json": JSON.stringify({ schemaVersion: source.schemaVersion, animations: source.animations, poses: source.poses }, null, 2),
        "hero.state-machine.json": JSON.stringify({ schemaVersion: source.schemaVersion, stateMachines: source.stateMachines, proceduralPresets: source.proceduralPresets }, null, 2),
        "hero.compiled.json": JSON.stringify(compiled, null, 2)
      },
      validation: {
        ok: true,
        errors: [],
        warnings: inputSvgParts.length ? [`SVG parts vectorized to path parts for production export: ${inputSvgParts.join(", ")}.`] : []
      }
    };
  } catch (error) {
    return {
      files: {},
      validation: { ok: false, errors: [error instanceof Error ? error.message : "Unknown export error"], warnings: [] }
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

function summarizeImport(project: EditorProjectState, kind: ProjectImportResult["kind"]): string {
  return `${kind ?? "source"}: ${project.name}, ${project.hierarchy.length} bones, ${Object.keys(project.parts).length} parts, ${Object.keys(project.animations).length} clips`;
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
