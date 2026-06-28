import type { DirtyScopes, EditorProjectState } from "./editorState";
import { cleanDirtyScopes, initialEditorProject } from "./editorState.ts";
import { fromSourceProject, toSourceProject } from "./editorSourceProject.ts";
import { vectorizeSvgParts } from "./editorVectorImport.ts";
import { compileRig, type CompiledRigProjectV1 } from "@bones/compiler";
import type { BoneDefinition, MeshShape, PartDefinition, PathCommand, RigProject, Transform2D } from "@bones/schema";

export const EDITOR_DRAFT_KEY = "bones:editor:draft:v1";
export const EDITOR_DRAFT_META_KEY = "bones:editor:draft-meta:v1";
export const CURRENT_EDITOR_SCHEMA_VERSION = "1.0.0";
export const EXPORT_BUNDLE_ROOT_DIR = "hero-hybrid-bundle";
export const DEFAULT_PATH_RUNTIME_BUNDLE_FILE = "hero.path-runtime.bundle.json";
export const DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE = "hero.hybrid-runtime.bundle.json";
export const DEFAULT_RUNTIME_BUNDLE_FILE = DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE;
export const DEFAULT_RUNTIME_ZIP_FILE = "hero.hybrid-runtime-bundle.zip";

export interface SerializedEditorProject {
  readonly schemaVersion: string;
  readonly savedAt: string;
  readonly project: EditorProjectState;
}

export interface ProjectExportBundle {
  readonly profile: ExportProfile;
  readonly files: Readonly<Record<string, string>>;
  readonly assetFiles: readonly ProjectExportAsset[];
  readonly manifest: ProjectReleaseManifest | null;
  readonly summary: ProjectExportSummary | null;
  readonly validation: { readonly ok: boolean; readonly errors: readonly string[]; readonly warnings: readonly string[] };
}

export interface ProjectExportAsset {
  readonly sourcePath: string;
  readonly zipPath: string;
  readonly runtimePath: string;
  readonly contentType: string;
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

export interface RuntimeParityReport {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: {
    readonly bones: number;
    readonly parts: number;
    readonly animations: number;
    readonly tracks: number;
    readonly states: number;
  };
}

export interface ProjectImportResult {
  readonly project?: EditorProjectState;
  readonly errors: readonly string[];
  readonly kind?: "source" | "legacy-wrapper";
  readonly summary?: string;
}

export interface DraftMetadata {
  readonly savedAt: string;
  readonly name: string;
  readonly bones: number;
  readonly parts: number;
  readonly animations: number;
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

export function createRuntimeParityReport(source: RigProject, compiled: CompiledRigProjectV1): RuntimeParityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceRig = source.rigs[0];
  const sourceAnimations = source.animations ?? [];
  const sourceStateMachines = source.stateMachines ?? [];
  const sourceTracks = sourceAnimations.reduce((count, clip) => count + clip.tracks.length, 0);
  const compiledTracks = compiled.animations.reduce((count, clip) => count + clip.tracks.length, 0);
  const sourceStates = sourceStateMachines.reduce((count, machine) => count + machine.states.length, 0);
  const compiledStates = compiled.stateMachines.reduce((count, machine) => count + machine.states.length, 0);

  if (!sourceRig) {
    errors.push("Source export has no rig.");
  } else {
    compareParityCount("bones", sourceRig.bones.length, compiled.rig.bones.length, errors);
    compareParityCount("parts", sourceRig.parts?.length ?? 0, compiled.rig.parts.length, errors);
    for (const bone of sourceRig.bones) {
      if (compiled.lookups.bones[bone.id] === undefined) {
        errors.push(`Compiled lookup misses bone '${bone.id}'.`);
      }
    }
    for (const part of sourceRig.parts ?? []) {
      if (part.type === "svg") {
        errors.push(`Runtime parity source still contains SVG part '${part.id}'.`);
      }
      if (compiled.lookups.parts[part.id] === undefined) {
        errors.push(`Compiled lookup misses part '${part.id}'.`);
      }
    }
  }
  compareParityCount("animations", sourceAnimations.length, compiled.animations.length, errors);
  compareParityCount("tracks", sourceTracks, compiledTracks, errors);
  compareParityCount("states", sourceStates, compiledStates, errors);
  for (const clip of sourceAnimations) {
    if (compiled.lookups.animations[clip.id] === undefined) {
      errors.push(`Compiled lookup misses animation '${clip.id}'.`);
    }
  }
  for (const machine of sourceStateMachines) {
    if (compiled.lookups.stateMachines[machine.id] === undefined) {
      errors.push(`Compiled lookup misses state machine '${machine.id}'.`);
    }
  }
  if (compiled.rig.parts.some((part) => part.type === "svg" || Boolean(part.svg))) {
    errors.push("Compiled runtime still contains SVG part payloads.");
  }
  if (JSON.stringify(compiled).includes("\"editor\"")) {
    errors.push("Compiled runtime contains editor metadata.");
  }
  if (source.rigs.length > 1) {
    warnings.push("Runtime parity report currently compares the first rig used by the compiler.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      bones: compiled.rig.bones.length,
      parts: compiled.rig.parts.length,
      animations: compiled.animations.length,
      tracks: compiledTracks,
      states: compiledStates
    }
  };
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
    const assetFiles = createTextureAssetEntries(compiled);
    const visualCompiled = createCompiledWithRuntimeTexturePaths(compiled, assetFiles);
    const pathSource = createPathRuntimeSourceProject(source);
    const pathCompiled = compileRig(pathSource);
    const pathValidation = validateProductionExport(pathSource, pathCompiled, profile);
    if (pathValidation.errors.length) {
      throw new Error(pathValidation.errors.join("; "));
    }
    const files: Record<string, string> = {
      "hero.source.rig.json": JSON.stringify(source, null, 2),
      "hero.rig.json": JSON.stringify({ schemaVersion: source.schemaVersion, runtimeTarget: source.runtimeTarget, rigs: source.rigs }, null, 2),
      "hero.animations.json": JSON.stringify({ schemaVersion: source.schemaVersion, animations: source.animations, poses: source.poses }, null, 2),
      "hero.state-machine.json": JSON.stringify({ schemaVersion: source.schemaVersion, stateMachines: source.stateMachines, proceduralPresets: source.proceduralPresets }, null, 2),
      "hero.compiled.json": JSON.stringify(compiled, null, 2),
      "hero.visual.compiled.json": JSON.stringify(visualCompiled, null, 2),
      "hero.path.source.rig.json": JSON.stringify(pathSource, null, 2),
      "hero.path.compiled.json": JSON.stringify(pathCompiled, null, 2),
      "hero.path.runtime.rig.json": JSON.stringify({ compiledFormatVersion: pathCompiled.compiledFormatVersion, schemaVersion: pathCompiled.schemaVersion, runtimeTarget: pathCompiled.runtimeTarget, sourceProjectId: pathCompiled.sourceProjectId, name: pathCompiled.name, rig: pathCompiled.rig, lookups: pathCompiled.lookups }, null, 2),
      "hero.path.runtime.animations.json": JSON.stringify({ compiledFormatVersion: pathCompiled.compiledFormatVersion, animations: pathCompiled.animations, lookups: pathCompiled.lookups.animations }, null, 2),
      "hero.path.runtime.state-machines.json": JSON.stringify({ compiledFormatVersion: pathCompiled.compiledFormatVersion, stateMachines: pathCompiled.stateMachines, lookups: pathCompiled.lookups.stateMachines }, null, 2),
      [DEFAULT_PATH_RUNTIME_BUNDLE_FILE]: JSON.stringify(createPathRuntimeDownloadBundle(pathSource, pathCompiled), null, 2),
      [DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE]: JSON.stringify(createHybridRuntimeDownloadBundle(source, visualCompiled, pathCompiled, assetFiles), null, 2),
      "manifest.json": JSON.stringify(createHybridPackageManifest(source, visualCompiled, pathCompiled, assetFiles), null, 2)
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
      assetFiles,
      manifest,
      summary,
      validation: {
        ok: validation.errors.length === 0,
        errors: [],
        warnings: [
          ...validation.warnings,
          ...pathValidation.warnings,
          ...(inputSvgParts.length ? [`SVG parts vectorized to path parts for production export: ${inputSvgParts.join(", ")}.`] : []),
          [`Hybrid runtime bundle added: ${DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE}.`],
          [`PNG texture assets queued for zip: ${assetFiles.length}.`],
          ...(compressedCompiled ? ["Compiled runtime artifact added as base64-encoded gzip: hero.compiled.json.gz."] : ["Gzip compression unavailable in this environment; use pnpm export:sample for release packaging."])
        ].flat()
      }
    };
  } catch (error) {
    return {
      profile,
      files: {},
      assetFiles: [],
      manifest: null,
      summary: null,
      validation: { ok: false, errors: [error instanceof Error ? error.message : "Unknown export error"], warnings: [] }
    };
  }
}

function createPathRuntimeSourceProject(source: RigProject): RigProject {
  return {
    ...source,
    rigs: source.rigs.map((rig) => {
      const boneWorldMatrices = buildBoneWorldMatrices(rig.bones);
      return {
        ...rig,
        parts: (rig.parts ?? []).map((part) => toPathRuntimePart(part, boneWorldMatrices))
      };
    }),
    editor: {
      ...(source.editor ?? {}),
      custom: {
        ...(source.editor?.custom ?? {}),
        exportMode: "path-runtime"
      }
    }
  };
}

function toPathRuntimePart(part: PartDefinition, boneWorldMatrices: ReadonlyMap<string, Matrix2D>): PartDefinition {
  if (part.path && part.type === "path") {
    return part;
  }
  if (!part.mesh) {
    return part;
  }

  const targetBoneId = selectDominantSkinBone(part.mesh) ?? part.boneId;
  const vertices = part.mesh.skin?.length ? skinnedVerticesInBoneLocal(part.mesh.skin, targetBoneId, boneWorldMatrices) : part.mesh.vertices;
  const commands = meshBoundaryToPathCommands(vertices, part.mesh.indices);
  if (!commands.length) {
    return part;
  }

  return {
    id: part.id,
    name: part.name,
    boneId: targetBoneId,
    type: "path",
    ...(part.drawOrder !== undefined ? { drawOrder: part.drawOrder } : {}),
    ...(part.visible !== undefined ? { visible: part.visible } : {}),
    ...(part.opacity !== undefined ? { opacity: part.opacity } : {}),
    local: part.mesh.skin?.length ? identityTransform() : part.local ?? part.transform ?? identityTransform(),
    fill: part.fill ?? { type: "solid", color: "#62636a", alpha: part.opacity ?? 1 },
    path: { closed: true, commands },
    ...(part.editor
      ? {
          editor: {
            ...part.editor,
            custom: {
              ...(part.editor.custom ?? {}),
              vectorizedFrom: part.mesh.texture ?? part.id,
              vectorization: "mesh-boundary-to-path"
            }
          }
        }
      : {})
  };
}

function createPathRuntimeDownloadBundle(source: RigProject, compiled: CompiledRigProjectV1): Record<string, unknown> {
  return {
    artifactVersion: "1.0.0",
    kind: "bones-path-runtime-bundle",
    entry: "compiled",
    sourceProject: {
      id: source.id,
      name: source.name,
      runtimeTarget: source.runtimeTarget
    },
    counts: {
      bones: compiled.rig.bones.length,
      parts: compiled.rig.parts.length,
      pathParts: compiled.rig.parts.filter((part) => Boolean(part.path)).length,
      animations: compiled.animations.length,
      states: compiled.stateMachines.reduce((count, machine) => count + machine.states.length, 0)
    },
    compiled,
    runtime: {
      rig: compiled.rig,
      animations: compiled.animations,
      stateMachines: compiled.stateMachines,
      proceduralLayers: compiled.proceduralLayers,
      ...(compiled.constraints ? { constraints: compiled.constraints } : {}),
      lookups: compiled.lookups
    }
  };
}

function createHybridRuntimeDownloadBundle(source: RigProject, visualCompiled: CompiledRigProjectV1, pathCompiled: CompiledRigProjectV1, assetFiles: readonly ProjectExportAsset[]): Record<string, unknown> {
  return {
    artifactVersion: "1.0.0",
    kind: "bones-hybrid-runtime-bundle",
    entry: {
      visual: "hero.visual.compiled.json",
      physics: "hero.path.compiled.json",
      assetsDir: "assets/"
    },
    sourceProject: {
      id: source.id,
      name: source.name,
      runtimeTarget: source.runtimeTarget
    },
    counts: {
      bones: visualCompiled.rig.bones.length,
      visualParts: visualCompiled.rig.parts.length,
      meshParts: visualCompiled.rig.parts.filter((part) => Boolean(part.mesh)).length,
      pathParts: pathCompiled.rig.parts.filter((part) => Boolean(part.path)).length,
      animations: visualCompiled.animations.length,
      states: visualCompiled.stateMachines.reduce((count, machine) => count + machine.states.length, 0),
      pngAssets: assetFiles.length
    },
    assets: assetFiles.map((asset) => ({
      path: asset.runtimePath,
      sourcePath: asset.sourcePath,
      contentType: asset.contentType
    })),
    runtimeFiles: {
      visual: "hero.visual.compiled.json",
      physics: "hero.path.compiled.json",
      assetBase: "assets/"
    }
  };
}

function createHybridPackageManifest(source: RigProject, visualCompiled: CompiledRigProjectV1, pathCompiled: CompiledRigProjectV1, assetFiles: readonly ProjectExportAsset[]): Record<string, unknown> {
  return {
    artifactVersion: "1.0.0",
    kind: "bones-hybrid-package-manifest",
    rootDir: EXPORT_BUNDLE_ROOT_DIR,
    files: {
      hybridBundle: DEFAULT_HYBRID_RUNTIME_BUNDLE_FILE,
      visualCompiled: "hero.visual.compiled.json",
      pathCompiled: "hero.path.compiled.json",
      source: "hero.source.rig.json"
    },
    sourceProject: {
      id: source.id,
      name: source.name,
      runtimeTarget: source.runtimeTarget
    },
    counts: {
      bones: visualCompiled.rig.bones.length,
      visualParts: visualCompiled.rig.parts.length,
      meshParts: visualCompiled.rig.parts.filter((part) => Boolean(part.mesh)).length,
      pathParts: pathCompiled.rig.parts.filter((part) => Boolean(part.path)).length,
      animations: visualCompiled.animations.length,
      pngAssets: assetFiles.length
    },
    assets: assetFiles.map((asset) => ({
      sourcePath: asset.sourcePath,
      zipPath: asset.zipPath,
      runtimePath: asset.runtimePath,
      contentType: asset.contentType
    }))
  };
}

function createTextureAssetEntries(compiled: CompiledRigProjectV1): readonly ProjectExportAsset[] {
  const usedNames = new Map<string, number>();
  const assets = new Map<string, ProjectExportAsset>();
  for (const texturePath of compiled.rig.parts.flatMap((part) => (part.mesh?.texture ? [part.mesh.texture] : []))) {
    if (assets.has(texturePath)) {
      continue;
    }
    const fileName = uniqueAssetFileName(texturePath, usedNames);
    assets.set(texturePath, {
      sourcePath: texturePath,
      zipPath: `${EXPORT_BUNDLE_ROOT_DIR}/assets/${fileName}`,
      runtimePath: `assets/${fileName}`,
      contentType: contentTypeForAsset(texturePath)
    });
  }
  return [...assets.values()];
}

function createCompiledWithRuntimeTexturePaths(compiled: CompiledRigProjectV1, assetFiles: readonly ProjectExportAsset[]): CompiledRigProjectV1 {
  const runtimePathBySource = new Map(assetFiles.map((asset) => [asset.sourcePath, asset.runtimePath]));
  return {
    ...compiled,
    rig: {
      ...compiled.rig,
      parts: compiled.rig.parts.map((part) => {
        const texture = part.mesh?.texture;
        const runtimePath = texture ? runtimePathBySource.get(texture) : undefined;
        if (!texture || !runtimePath || !part.mesh) {
          return part;
        }
        return {
          ...part,
          mesh: {
            ...part.mesh,
            texture: runtimePath
          }
        };
      })
    }
  };
}

function uniqueAssetFileName(assetPath: string, usedNames: Map<string, number>): string {
  const urlPath = assetPath.split("?")[0] ?? assetPath;
  const rawName = urlPath.split("/").filter(Boolean).at(-1) ?? "asset.png";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_") || "asset.png";
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : ".png";
  const nextIndex = usedNames.get(safeName) ?? 0;
  usedNames.set(safeName, nextIndex + 1);
  return nextIndex === 0 ? safeName : `${baseName}-${nextIndex}${extension}`;
}

function contentTypeForAsset(assetPath: string): string {
  const lower = assetPath.split("?")[0]?.toLowerCase() ?? assetPath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function selectDominantSkinBone(mesh: MeshShape): string | undefined {
  const weights = new Map<string, number>();
  for (const vertex of mesh.skin ?? []) {
    for (const influence of vertex) {
      weights.set(influence.boneId, (weights.get(influence.boneId) ?? 0) + influence.weight);
    }
  }
  return [...weights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function skinnedVerticesInBoneLocal(skin: NonNullable<MeshShape["skin"]>, targetBoneId: string, boneWorldMatrices: ReadonlyMap<string, Matrix2D>): readonly number[] {
  const inverseTarget = invertMatrix(boneWorldMatrices.get(targetBoneId) ?? identityMatrix());
  const vertices: number[] = [];
  for (const vertex of skin) {
    let worldX = 0;
    let worldY = 0;
    let totalWeight = 0;
    for (const influence of vertex) {
      const world = applyMatrix(boneWorldMatrices.get(influence.boneId) ?? identityMatrix(), influence.x, influence.y);
      worldX += world.x * influence.weight;
      worldY += world.y * influence.weight;
      totalWeight += influence.weight;
    }
    if (totalWeight > 0 && Math.abs(totalWeight - 1) > 0.0001) {
      worldX /= totalWeight;
      worldY /= totalWeight;
    }
    const local = applyMatrix(inverseTarget, worldX, worldY);
    vertices.push(round(local.x), round(local.y));
  }
  return vertices;
}

function meshBoundaryToPathCommands(vertices: readonly number[], indices: readonly number[]): readonly PathCommand[] {
  const loops = indices.length ? traceBoundaryLoops(indices) : [Array.from({ length: Math.floor(vertices.length / 2) }, (_, index) => index)];
  const commands: PathCommand[] = [];
  for (const loop of loops) {
    const points = simplifyLoop(loop.map((vertexIndex) => ({ x: vertices[vertexIndex * 2] ?? 0, y: vertices[vertexIndex * 2 + 1] ?? 0 })));
    if (points.length < 3) {
      continue;
    }
    commands.push({ type: "M", x: round(points[0]!.x), y: round(points[0]!.y) });
    for (const point of points.slice(1)) {
      commands.push({ type: "L", x: round(point.x), y: round(point.y) });
    }
    commands.push({ type: "Z" });
  }
  return commands;
}

function traceBoundaryLoops(indices: readonly number[]): readonly (readonly number[])[] {
  const edgeCounts = new Map<string, { readonly a: number; readonly b: number; readonly count: number }>();
  for (let index = 0; index < indices.length; index += 3) {
    countEdge(edgeCounts, indices[index], indices[index + 1]);
    countEdge(edgeCounts, indices[index + 1], indices[index + 2]);
    countEdge(edgeCounts, indices[index + 2], indices[index]);
  }

  const adjacency = new Map<number, Set<number>>();
  const remaining = new Set<string>();
  for (const [key, edge] of edgeCounts.entries()) {
    if (edge.count !== 1) {
      continue;
    }
    remaining.add(key);
    addNeighbor(adjacency, edge.a, edge.b);
    addNeighbor(adjacency, edge.b, edge.a);
  }

  const loops: number[][] = [];
  while (remaining.size) {
    const startKey = remaining.values().next().value;
    const startEdge = startKey ? edgeCounts.get(startKey) : undefined;
    if (!startKey || !startEdge) {
      break;
    }
    const loop = [startEdge.a, startEdge.b];
    remaining.delete(startKey);
    let previous = startEdge.a;
    let current = startEdge.b;
    while (current !== startEdge.a) {
      const next = [...(adjacency.get(current) ?? [])].find((candidate) => candidate !== previous && remaining.has(edgeKey(current, candidate)));
      if (next === undefined) {
        break;
      }
      remaining.delete(edgeKey(current, next));
      previous = current;
      current = next;
      if (current !== startEdge.a) {
        loop.push(current);
      }
    }
    loops.push(loop);
  }
  return loops.sort((left, right) => right.length - left.length);
}

function countEdge(edges: Map<string, { readonly a: number; readonly b: number; readonly count: number }>, a: number | undefined, b: number | undefined): void {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return;
  }
  const edgeA = a!;
  const edgeB = b!;
  const key = edgeKey(edgeA, edgeB);
  const edge = edges.get(key) ?? { a: Math.min(edgeA, edgeB), b: Math.max(edgeA, edgeB), count: 0 };
  edges.set(key, { ...edge, count: edge.count + 1 });
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addNeighbor(adjacency: Map<number, Set<number>>, from: number, to: number): void {
  const neighbors = adjacency.get(from) ?? new Set<number>();
  neighbors.add(to);
  adjacency.set(from, neighbors);
}

function simplifyLoop(points: readonly { readonly x: number; readonly y: number }[]): readonly { readonly x: number; readonly y: number }[] {
  if (points.length <= 3) {
    return points;
  }
  const out: { readonly x: number; readonly y: number }[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const area = Math.abs((current.x - previous.x) * (next.y - previous.y) - (current.y - previous.y) * (next.x - previous.x));
    if (area > 0.01) {
      out.push(current);
    }
  }
  return out.length >= 3 ? out : points;
}

interface Matrix2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

function buildBoneWorldMatrices(bones: readonly BoneDefinition[]): ReadonlyMap<string, Matrix2D> {
  const matrices = new Map<string, Matrix2D>();
  const bonesById = new Map(bones.map((bone) => [bone.id, bone]));
  const visit = (boneId: string): Matrix2D => {
    const cached = matrices.get(boneId);
    if (cached) {
      return cached;
    }
    const bone = bonesById.get(boneId);
    if (!bone) {
      return identityMatrix();
    }
    const local = matrixFromTransform(bone.local ?? bone.transform ?? identityTransform());
    const world = bone.parentId ? multiplyMatrices(visit(bone.parentId), local) : local;
    matrices.set(boneId, world);
    return world;
  };
  for (const bone of bones) {
    visit(bone.id);
  }
  return matrices;
}

function matrixFromTransform(transform: Transform2D): Matrix2D {
  const skewX = transform.skewX ?? 0;
  const skewY = transform.skewY ?? 0;
  return {
    a: Math.cos(transform.rotation + skewY) * transform.scaleX,
    b: Math.sin(transform.rotation + skewY) * transform.scaleX,
    c: -Math.sin(transform.rotation - skewX) * transform.scaleY,
    d: Math.cos(transform.rotation - skewX) * transform.scaleY,
    tx: transform.x,
    ty: transform.y
  };
}

function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    tx: left.a * right.tx + left.c * right.ty + left.tx,
    ty: left.b * right.tx + left.d * right.ty + left.ty
  };
}

function invertMatrix(matrix: Matrix2D): Matrix2D {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 0.000001) {
    return identityMatrix();
  }
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / determinant,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / determinant
  };
}

function applyMatrix(matrix: Matrix2D, x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: matrix.a * x + matrix.c * y + matrix.tx, y: matrix.b * x + matrix.d * y + matrix.ty };
}

function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function identityTransform(): Transform2D {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

function round(value: number): number {
  return Number(value.toFixed(4));
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

function compareParityCount(label: string, sourceCount: number, compiledCount: number, errors: string[]): void {
  if (sourceCount !== compiledCount) {
    errors.push(`Runtime parity mismatch for ${label}: source ${sourceCount}, compiled ${compiledCount}.`);
  }
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
  storage.setItem(EDITOR_DRAFT_META_KEY, JSON.stringify(createDraftMetadata(project)));
}

export function loadDraft(storage: Pick<Storage, "getItem"> = window.localStorage): EditorProjectState | undefined {
  const value = storage.getItem(EDITOR_DRAFT_KEY);
  return value ? parseEditorProject(value) : undefined;
}

export function loadDraftMeta(storage: Pick<Storage, "getItem"> = window.localStorage): DraftMetadata | null {
  const value = storage.getItem(EDITOR_DRAFT_META_KEY);
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<DraftMetadata>;
    return typeof parsed.savedAt === "string" && typeof parsed.name === "string"
      ? {
          savedAt: parsed.savedAt,
          name: parsed.name,
          bones: Number(parsed.bones ?? 0),
          parts: Number(parsed.parts ?? 0),
          animations: Number(parsed.animations ?? 0)
        }
      : null;
  } catch {
    return null;
  }
}

function createDraftMetadata(project: EditorProjectState): DraftMetadata {
  return {
    savedAt: new Date().toISOString(),
    name: project.name,
    bones: project.hierarchy.length,
    parts: Object.keys(project.parts).length,
    animations: Object.keys(project.animations).length
  };
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
