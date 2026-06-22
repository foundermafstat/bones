import type { DirtyScopes, EditorProjectState } from "./editorState";
import { cleanDirtyScopes, initialEditorProject } from "./editorState.ts";
import { fromSourceProject, toSourceProject } from "./editorSourceProject.ts";
import { vectorizeSvgParts } from "./editorVectorImport.ts";
import { compileRig, type CompiledRigProjectV1 } from "@bones/compiler";
import type { RigProject } from "@bones/schema";

export const EDITOR_DRAFT_KEY = "bones:editor:draft:v1";
export const CURRENT_EDITOR_SCHEMA_VERSION = "1.0.0";

export interface SerializedEditorProject {
  readonly schemaVersion: string;
  readonly savedAt: string;
  readonly project: EditorProjectState;
}

export interface ProjectExportBundle {
  readonly profile: ExportProfile;
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: ProjectReleaseManifest | null;
  readonly summary: ProjectExportSummary | null;
  readonly validation: { readonly ok: boolean; readonly errors: readonly string[]; readonly warnings: readonly string[] };
}

export type ExportProfile = "development" | "production" | "debug";

export interface ProjectExportOptions {
  readonly profile?: ExportProfile;
}

export interface ProjectExportSummary {
  readonly profile: ExportProfile;
  readonly totalBytes: number;
  readonly compressedBytes?: number;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly bones: number;
  readonly parts: number;
  readonly animations: number;
  readonly states: number;
}

export interface ProjectReleaseManifest {
  readonly artifactVersion: "1.0.0";
  readonly profile: ExportProfile;
  readonly sourceProjectId: string;
  readonly runtimeTarget: string;
  readonly migration: {
    readonly sourceSchemaVersion: string;
    readonly compiledFormatVersion: string;
  };
  readonly counts: {
    readonly bones: number;
    readonly parts: number;
    readonly animations: number;
    readonly states: number;
  };
  readonly files: Readonly<Record<string, { readonly bytes: number; readonly sha256: string; readonly encoding?: "utf8" | "base64-gzip" }>>;
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

export async function createProjectExportBundle(project: EditorProjectState, loadText?: (assetPath: string) => Promise<string>, options: ProjectExportOptions = {}): Promise<ProjectExportBundle> {
  const profile = options.profile ?? "production";
  try {
    const inputSvgParts = Object.values(project.parts).filter((part) => part.type === "svg").map((part) => part.id);
    const vectorProject = await vectorizeSvgParts(project, loadText);
    const source = toSourceProject(vectorProject);
    const compiled = compileRig(source);
    const validation = validateProductionExport(source, compiled, profile);
    if (validation.errors.length) {
      throw new Error(validation.errors.join("; "));
    }
    const files: Record<string, string> = {
      "hero.source.rig.json": JSON.stringify(source, null, 2),
      "hero.rig.json": JSON.stringify({ schemaVersion: source.schemaVersion, runtimeTarget: source.runtimeTarget, rigs: source.rigs }, null, 2),
      "hero.animations.json": JSON.stringify({ schemaVersion: source.schemaVersion, animations: source.animations, poses: source.poses }, null, 2),
      "hero.state-machine.json": JSON.stringify({ schemaVersion: source.schemaVersion, stateMachines: source.stateMachines, proceduralPresets: source.proceduralPresets }, null, 2),
      "hero.compiled.json": JSON.stringify(compiled, null, 2)
    };
    const compressedCompiled = profile !== "development" ? await gzipBase64(files["hero.compiled.json"]!) : undefined;
    if (compressedCompiled) {
      files["hero.compiled.json.gz"] = compressedCompiled;
    }
    const manifest = await createReleaseManifest(source, compiled, files, profile);
    files["hero.release-manifest.json"] = JSON.stringify(manifest, null, 2);
    const summary = createExportSummary(manifest);
    return {
      profile,
      files,
      manifest,
      summary,
      validation: {
        ok: validation.errors.length === 0,
        errors: [],
        warnings: [
          ...validation.warnings,
          ...(inputSvgParts.length ? [`SVG parts vectorized to path parts for production export: ${inputSvgParts.join(", ")}.`] : []),
          ...(compressedCompiled ? ["Compiled runtime artifact added as base64-encoded gzip: hero.compiled.json.gz."] : ["Gzip compression unavailable in this environment; use pnpm export:sample for release packaging."])
        ]
      }
    };
  } catch (error) {
    return {
      profile,
      files: {},
      manifest: null,
      summary: null,
      validation: { ok: false, errors: [error instanceof Error ? error.message : "Unknown export error"], warnings: [] }
    };
  }
}

function validateProductionExport(source: RigProject, compiled: CompiledRigProjectV1, profile: ExportProfile): { readonly errors: string[]; readonly warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const svgParts = source.rigs.flatMap((rig) => (rig.parts ?? []).filter((part) => part.type === "svg").map((part) => part.id));
  if (svgParts.length) {
    errors.push(`Production export still contains SVG parts: ${svgParts.join(", ")}.`);
  }
  const clips = new Map((source.animations ?? []).map((clip) => [clip.id, clip]));
  for (const machine of source.stateMachines ?? []) {
    const parameters = new Set((machine.parameters ?? []).map((parameter) => parameter.id));
    for (const state of machine.states) {
      const clipIds = [state.clipId, ...(state.blendTree?.children.map((child) => child.clipId) ?? [])].filter((id): id is string => Boolean(id));
      for (const clipId of clipIds) {
        const clip = clips.get(clipId);
        if (!clip) {
          errors.push(`State '${state.id}' references missing clip '${clipId}'.`);
          continue;
        }
        if (profile === "production" && clip.tracks.length === 0) {
          errors.push(`State '${state.id}' uses empty clip '${clipId}'.`);
        }
      }
    }
    for (const transition of machine.transitions ?? []) {
      for (const condition of transition.conditions ?? []) {
        if (!parameters.has(condition.parameterId)) {
          errors.push(`Transition '${transition.id}' references missing parameter '${condition.parameterId}'.`);
        }
      }
    }
  }
  for (const rig of source.rigs) {
    for (const part of rig.parts ?? []) {
      const pathCount = part.path?.commands.length ?? 0;
      if (pathCount > 800) {
        warnings.push(`Part '${part.id}' has ${pathCount} path commands; consider simplification before mobile release.`);
      }
    }
  }
  if (JSON.stringify(compiled).includes("\"editor\"")) {
    errors.push("Compiled export contains editor metadata.");
  }
  return { errors, warnings };
}

async function createReleaseManifest(source: RigProject, compiled: CompiledRigProjectV1, files: Readonly<Record<string, string>>, profile: ExportProfile): Promise<ProjectReleaseManifest> {
  const manifestFiles: Record<string, { bytes: number; sha256: string; encoding?: "utf8" | "base64-gzip" }> = {};
  for (const [fileName, contents] of Object.entries(files)) {
    const encoding = fileName.endsWith(".gz") ? "base64-gzip" : "utf8";
    manifestFiles[fileName] = {
      bytes: byteLength(contents),
      sha256: await sha256Hex(contents),
      encoding
    };
  }
  return {
    artifactVersion: "1.0.0",
    profile,
    sourceProjectId: source.id,
    runtimeTarget: source.runtimeTarget,
    migration: {
      sourceSchemaVersion: source.schemaVersion,
      compiledFormatVersion: compiled.compiledFormatVersion
    },
    counts: {
      bones: source.rigs.reduce((count, rig) => count + rig.bones.length, 0),
      parts: source.rigs.reduce((count, rig) => count + (rig.parts?.length ?? 0), 0),
      animations: source.animations?.length ?? 0,
      states: source.stateMachines?.reduce((count, machine) => count + machine.states.length, 0) ?? 0
    },
    files: manifestFiles
  };
}

function createExportSummary(manifest: ProjectReleaseManifest): ProjectExportSummary {
  const files = manifest.files;
  return {
    profile: manifest.profile,
    totalBytes: Object.values(files).reduce((total, file) => total + file.bytes, 0),
    ...(files["hero.compiled.json.gz"] ? { compressedBytes: files["hero.compiled.json.gz"].bytes } : {}),
    sourceHash: files["hero.source.rig.json"]?.sha256 ?? "",
    compiledHash: files["hero.compiled.json"]?.sha256 ?? "",
    bones: manifest.counts.bones,
    parts: manifest.counts.parts,
    animations: manifest.counts.animations,
    states: manifest.counts.states
  };
}

async function gzipBase64(contents: string): Promise<string | undefined> {
  if (typeof CompressionStream === "undefined") {
    return undefined;
  }
  const stream = new Blob([contents]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

async function sha256Hex(contents: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 is unavailable in this environment.");
  }
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(contents));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function byteLength(contents: string): number {
  return new TextEncoder().encode(contents).byteLength;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 8192));
  }
  return btoa(binary);
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
    dirtyScopes: normalizeDirtyScopes(project.dirtyScopes),
    autosave: project.autosave ?? initialEditorProject.autosave
  };
}

function normalizeDirtyScopes(dirtyScopes: DirtyScopes | undefined): DirtyScopes {
  return {
    project: dirtyScopes?.project ?? cleanDirtyScopes.project,
    bones: dirtyScopes?.bones ?? cleanDirtyScopes.bones,
    parts: dirtyScopes?.parts ?? cleanDirtyScopes.parts,
    animations: dirtyScopes?.animations ?? cleanDirtyScopes.animations,
    poses: dirtyScopes?.poses ?? cleanDirtyScopes.poses,
    stateMachine: dirtyScopes?.stateMachine ?? cleanDirtyScopes.stateMachine,
    procedural: dirtyScopes?.procedural ?? cleanDirtyScopes.procedural,
    preview: dirtyScopes?.preview ?? cleanDirtyScopes.preview
  };
}
