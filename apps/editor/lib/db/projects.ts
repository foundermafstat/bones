import { assertRigProject, type RigProject } from "@bones/schema";
import { and, desc, eq, max, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDatabase } from "./client";
import { bonesOwners, bonesProjectAssets, bonesProjectRevisions, bonesProjects } from "./schema";

const ownerKey = process.env.BONES_OWNER_KEY?.trim() || "local-owner";

export class ProjectVersionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super(`Project changed in another tab (current version ${currentVersion}).`);
  }
}

export function sourceHash(source: RigProject): string {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function projectSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "untitled-rig";
}

async function getOwnerId(): Promise<string> {
  const db = getDatabase();
  await db.insert(bonesOwners).values({ ownerKey }).onConflictDoNothing({ target: bonesOwners.ownerKey });
  const [owner] = await db.select({ id: bonesOwners.id }).from(bonesOwners).where(eq(bonesOwners.ownerKey, ownerKey)).limit(1);
  if (!owner) throw new Error("Could not resolve Bones owner.");
  return owner.id;
}

export async function listProjects() {
  const db = getDatabase();
  const ownerId = await getOwnerId();
  return db.select({
    id: bonesProjects.id,
    name: bonesProjects.name,
    slug: bonesProjects.slug,
    version: bonesProjects.version,
    characterKind: sql<string>`coalesce(${bonesProjects.sourceJson} #>> '{editor,custom,characterKind}', 'human')`,
    boneCount: sql<number>`jsonb_array_length(coalesce(${bonesProjects.sourceJson} #> '{rigs,0,bones}', '[]'::jsonb))`,
    partCount: sql<number>`jsonb_array_length(coalesce(${bonesProjects.sourceJson} #> '{rigs,0,parts}', '[]'::jsonb))`,
    animationCount: sql<number>`jsonb_array_length(coalesce(${bonesProjects.sourceJson} -> 'animations', '[]'::jsonb))`,
    createdAt: bonesProjects.createdAt,
    updatedAt: bonesProjects.updatedAt
  }).from(bonesProjects).where(eq(bonesProjects.ownerId, ownerId)).orderBy(desc(bonesProjects.updatedAt));
}

export async function createProject(sourceInput: unknown) {
  const source = assertRigProject(sourceInput);
  const db = getDatabase();
  const ownerId = await getOwnerId();
  const hash = sourceHash(source);
  const [project] = await db.insert(bonesProjects).values({
    id: source.id,
    ownerId,
    name: source.name,
    slug: projectSlug(source.name),
    sourceJson: source,
    sourceHash: hash
  }).onConflictDoUpdate({
    target: bonesProjects.id,
    set: { name: source.name, slug: projectSlug(source.name), sourceJson: source, sourceHash: hash, updatedAt: new Date() }
  }).returning();
  if (!project) throw new Error("Project insert returned no row.");
  return project;
}

export async function getProject(projectId: string) {
  const db = getDatabase();
  const ownerId = await getOwnerId();
  const [project] = await db.select().from(bonesProjects).where(and(eq(bonesProjects.id, projectId), eq(bonesProjects.ownerId, ownerId))).limit(1);
  return project;
}

export async function updateProject(projectId: string, version: number, sourceInput: unknown) {
  const source = assertRigProject(sourceInput);
  if (source.id !== projectId) throw new Error("Project id does not match source id.");
  const db = getDatabase();
  const ownerId = await getOwnerId();
  const hash = sourceHash(source);
  const [project] = await db.update(bonesProjects).set({
    name: source.name,
    slug: projectSlug(source.name),
    sourceJson: source,
    sourceHash: hash,
    version: version + 1,
    updatedAt: new Date()
  }).where(and(eq(bonesProjects.id, projectId), eq(bonesProjects.ownerId, ownerId), eq(bonesProjects.version, version))).returning();
  if (project) return project;
  const current = await getProject(projectId);
  if (current) throw new ProjectVersionConflictError(current.version);
  throw new Error("Project not found.");
}

export async function createRevision(projectId: string, kind: "manual" | "periodic" | "restore" | "import", label?: string) {
  const db = getDatabase();
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  const [counter] = await db.select({ value: max(bonesProjectRevisions.revisionNumber) }).from(bonesProjectRevisions).where(eq(bonesProjectRevisions.projectId, projectId));
  const revisionNumber = (counter?.value ?? 0) + 1;
  const [revision] = await db.insert(bonesProjectRevisions).values({
    projectId,
    revisionNumber,
    kind,
    ...(label ? { label } : {}),
    sourceJson: project.sourceJson,
    sourceHash: project.sourceHash
  }).returning();
  return revision;
}

export async function listRevisions(projectId: string) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  return getDatabase().select({
    id: bonesProjectRevisions.id,
    revisionNumber: bonesProjectRevisions.revisionNumber,
    kind: bonesProjectRevisions.kind,
    label: bonesProjectRevisions.label,
    sourceHash: bonesProjectRevisions.sourceHash,
    createdAt: bonesProjectRevisions.createdAt
  }).from(bonesProjectRevisions).where(eq(bonesProjectRevisions.projectId, projectId)).orderBy(desc(bonesProjectRevisions.createdAt));
}

export async function restoreRevision(projectId: string, revisionId: string, version: number) {
  const db = getDatabase();
  const [revision] = await db.select().from(bonesProjectRevisions).where(and(eq(bonesProjectRevisions.id, revisionId), eq(bonesProjectRevisions.projectId, projectId))).limit(1);
  if (!revision) throw new Error("Revision not found.");
  await createRevision(projectId, "restore", `Before restore to revision ${revision.revisionNumber}`);
  const project = await updateProject(projectId, version, revision.sourceJson);
  return project;
}

export async function listAssets(projectId: string) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  return getDatabase().select().from(bonesProjectAssets).where(eq(bonesProjectAssets.projectId, projectId)).orderBy(bonesProjectAssets.relativePath);
}

export async function upsertAsset(projectId: string, input: Record<string, unknown>) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  const id = requiredString(input.id, "asset id");
  const relativePath = requiredString(input.relativePath, "relative path");
  if (!relativePath.startsWith("assets/") || relativePath.includes("..")) throw new Error("Asset path must stay inside assets/.");
  const values = {
    id,
    projectId,
    relativePath,
    originalName: requiredString(input.originalName, "original name"),
    mimeType: requiredString(input.mimeType, "MIME type"),
    byteSize: requiredNumber(input.byteSize, "byte size"),
    checksum: requiredString(input.checksum, "checksum"),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    updatedAt: new Date()
  };
  const [asset] = await getDatabase().insert(bonesProjectAssets).values(values).onConflictDoUpdate({
    target: bonesProjectAssets.id,
    set: values
  }).returning();
  return asset;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${label}.`);
  return value.trim();
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}.`);
  return Math.round(value);
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}
