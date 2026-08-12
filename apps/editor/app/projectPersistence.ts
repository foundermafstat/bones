import type { RigProject } from "@bones/schema";

export interface RemoteProjectSession {
  readonly id: string;
  readonly version: number;
  readonly updatedAt: string;
}

export interface RemoteProjectSnapshot extends RemoteProjectSession {
  readonly sourceJson: RigProject;
  readonly name: string;
  readonly slug: string;
}

export interface RemoteProjectSummary extends RemoteProjectSession {
  readonly name: string;
  readonly slug: string;
  readonly characterKind: "human" | "dog" | "cat";
  readonly boneCount: number;
  readonly partCount: number;
  readonly animationCount: number;
  readonly createdAt: string;
}

export class RemoteProjectConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super(`Project changed in another tab (version ${currentVersion}).`);
    this.currentVersion = currentVersion;
  }
}

export async function ensureRemoteProject(source: RigProject): Promise<RemoteProjectSession> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source })
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not create project."));
  return projectSession(body.project);
}

export async function listRemoteProjects(): Promise<readonly RemoteProjectSummary[]> {
  const response = await fetch("/api/projects");
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not list characters."));
  if (!Array.isArray(body.projects)) return [];
  return body.projects.flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return [];
    const project = value as Record<string, unknown>;
    if (typeof project.id !== "string" || typeof project.name !== "string" || typeof project.version !== "number") return [];
    const characterKind = project.characterKind === "dog" || project.characterKind === "cat" ? project.characterKind : "human";
    return [{
      id: project.id,
      name: project.name,
      slug: typeof project.slug === "string" ? project.slug : "untitled-rig",
      version: project.version,
      characterKind,
      boneCount: finiteCount(project.boneCount),
      partCount: finiteCount(project.partCount),
      animationCount: finiteCount(project.animationCount),
      createdAt: String(project.createdAt ?? new Date(0).toISOString()),
      updatedAt: String(project.updatedAt ?? new Date(0).toISOString())
    }];
  });
}

export async function saveRemoteProject(source: RigProject, version: number): Promise<RemoteProjectSession> {
  const response = await fetch(`/api/projects/${encodeURIComponent(source.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, version })
  });
  const body = await readJson(response);
  if (response.status === 409) throw new RemoteProjectConflictError(typeof body.currentVersion === "number" ? body.currentVersion : version);
  if (!response.ok) throw new Error(errorMessage(body, "Could not save project."));
  return projectSession(body.project);
}

export async function loadRemoteProject(projectId: string): Promise<RemoteProjectSnapshot> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not load project."));
  const project = body.project as Record<string, unknown>;
  const session = projectSession(project);
  if (!project.sourceJson || typeof project.sourceJson !== "object") throw new Error("Remote project has no source JSON.");
  return {
    ...session,
    sourceJson: project.sourceJson as RigProject,
    name: typeof project.name === "string" ? project.name : "Untitled Rig",
    slug: typeof project.slug === "string" ? project.slug : "untitled-rig"
  };
}

export async function createRemoteRevision(projectId: string, kind: "manual" | "periodic" | "import" = "manual", label?: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, label })
  });
  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(errorMessage(body, "Could not create revision."));
  }
}

export interface RemoteRevisionSummary {
  readonly id: string;
  readonly revisionNumber: number;
  readonly kind: string;
  readonly label: string | null;
  readonly createdAt: string;
}

export async function listRemoteRevisions(projectId: string): Promise<readonly RemoteRevisionSummary[]> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`);
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not list revisions."));
  return Array.isArray(body.revisions) ? body.revisions as RemoteRevisionSummary[] : [];
}

export async function restoreRemoteRevision(projectId: string, revisionId: string, version: number): Promise<RemoteProjectSession> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version })
  });
  const body = await readJson(response);
  if (response.status === 409) throw new RemoteProjectConflictError(typeof body.currentVersion === "number" ? body.currentVersion : version);
  if (!response.ok) throw new Error(errorMessage(body, "Could not restore revision."));
  return projectSession(body.project);
}

export async function upsertRemoteAsset(projectId: string, asset: ProjectAssetMetadata): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(asset)
  });
  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(errorMessage(body, "Could not save asset metadata."));
  }
}

export interface ProjectAssetMetadata {
  readonly id: string;
  readonly relativePath: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksum: string;
  readonly width?: number;
  readonly height?: number;
}

async function readJson(response: Response): Promise<Record<string, any>> {
  try {
    return await response.json() as Record<string, any>;
  } catch {
    return {};
  }
}

function errorMessage(body: Record<string, any>, fallback: string): string {
  return typeof body.error === "string" ? body.error : fallback;
}

function projectSession(value: unknown): RemoteProjectSession {
  if (!value || typeof value !== "object") throw new Error("Project API returned an invalid response.");
  const project = value as Record<string, unknown>;
  if (typeof project.id !== "string" || typeof project.version !== "number") throw new Error("Project API returned an invalid project session.");
  return { id: project.id, version: project.version, updatedAt: String(project.updatedAt ?? new Date().toISOString()) };
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}
