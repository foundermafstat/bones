import { BONES_RUNTIME_TARGET, BONES_SCHEMA_VERSION, type RigProject } from "./types.js";
import { assertRigProject } from "./validate.js";

export interface MigrationResult {
  readonly project: RigProject;
  readonly migrated: boolean;
  readonly fromVersion?: string;
  readonly toVersion: typeof BONES_SCHEMA_VERSION;
}

export function migrateRigProject(input: unknown): MigrationResult {
  if (!isRecord(input)) {
    return { project: assertRigProject(input), migrated: false, toVersion: BONES_SCHEMA_VERSION };
  }

  const fromVersion = typeof input.schemaVersion === "string" ? input.schemaVersion : undefined;
  const normalized = {
    ...input,
    schemaVersion: BONES_SCHEMA_VERSION,
    runtimeTarget: input.runtimeTarget ?? BONES_RUNTIME_TARGET,
    projectId: input.projectId ?? input.id,
    units: input.units ?? "pixels",
    defaultFrameRate: input.defaultFrameRate ?? 60
  };

  return {
    project: assertRigProject(normalized),
    migrated: fromVersion !== BONES_SCHEMA_VERSION || input.projectId === undefined || input.units === undefined || input.defaultFrameRate === undefined,
    ...(fromVersion ? { fromVersion } : {}),
    toVersion: BONES_SCHEMA_VERSION
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
