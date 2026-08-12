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
    defaultFrameRate: input.defaultFrameRate ?? 60,
    rigs: migrateVisualSlots(input.rigs)
  };

  return {
    project: assertRigProject(normalized),
    migrated: fromVersion !== BONES_SCHEMA_VERSION || input.projectId === undefined || input.units === undefined || input.defaultFrameRate === undefined,
    ...(fromVersion ? { fromVersion } : {}),
    toVersion: BONES_SCHEMA_VERSION
  };
}

function migrateVisualSlots(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((rig) => {
    if (!isRecord(rig) || !Array.isArray(rig.visualSlots)) return rig;
    const attachmentsBySlot = new Map<string, Set<string>>();
    if (Array.isArray(rig.skins)) {
      for (const skin of rig.skins) {
        if (!isRecord(skin) || !Array.isArray(skin.attachments)) continue;
        for (const attachment of skin.attachments) {
          if (!isRecord(attachment) || typeof attachment.slotId !== "string" || typeof attachment.partId !== "string") continue;
          const partIds = attachmentsBySlot.get(attachment.slotId) ?? new Set<string>();
          partIds.add(attachment.partId);
          attachmentsBySlot.set(attachment.slotId, partIds);
        }
      }
    }
    return {
      ...rig,
      visualSlots: rig.visualSlots.map((slot) => {
        if (!isRecord(slot) || typeof slot.id !== "string" || Array.isArray(slot.partIds)) return slot;
        return { ...slot, partIds: [...(attachmentsBySlot.get(slot.id) ?? [])] };
      })
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
