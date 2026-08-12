import {
  BONES_COMPILED_FORMAT_VERSION,
  BONES_LEGACY_COMPILED_FORMAT_VERSION,
  type CompiledRigProjectV1
} from "./types.js";

export class CompiledMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompiledMigrationError";
  }
}

export function migrateCompiledRigProject(input: unknown): CompiledRigProjectV1 {
  if (!isRecord(input)) {
    throw new CompiledMigrationError("Compiled rig project must be an object.");
  }

  if (input.compiledFormatVersion === BONES_COMPILED_FORMAT_VERSION) {
    return input as unknown as CompiledRigProjectV1;
  }

  if (input.compiledFormatVersion === BONES_LEGACY_COMPILED_FORMAT_VERSION) {
    return migrateCompiledV1_0(input);
  }

  if (input.compiledFormatVersion !== BONES_COMPILED_FORMAT_VERSION) {
    throw new CompiledMigrationError(
      `Unsupported compiledFormatVersion '${String(input.compiledFormatVersion)}'. Expected '${BONES_COMPILED_FORMAT_VERSION}'.`
    );
  }

  return input as unknown as CompiledRigProjectV1;
}

function migrateCompiledV1_0(input: Record<string, unknown>): CompiledRigProjectV1 {
  const rig = isRecord(input.rig) ? input.rig : {};
  const visualSlots = Array.isArray(rig.visualSlots) ? rig.visualSlots : [];
  const skins = Array.isArray(rig.skins) ? rig.skins : [];
  const migratedSlots = visualSlots.map((slot, slotIndex) => {
    if (!isRecord(slot)) return slot;
    const partIds = new Set<number>();
    for (const skin of skins) {
      if (!isRecord(skin) || !Array.isArray(skin.attachments)) continue;
      for (const attachment of skin.attachments) {
        if (isRecord(attachment) && attachment.slot === slotIndex && typeof attachment.part === "number") {
          partIds.add(attachment.part);
        }
      }
    }
    return { ...slot, partIds: [...partIds].sort((left, right) => left - right) };
  });
  const lookups = isRecord(input.lookups) ? input.lookups : {};
  const visualSlotLookup = Object.fromEntries(
    migratedSlots.flatMap((slot, index) =>
      isRecord(slot) && typeof slot.id === "string" ? [[slot.id, index] as const] : []
    )
  );

  return {
    ...input,
    compiledFormatVersion: BONES_COMPILED_FORMAT_VERSION,
    rig: { ...rig, visualSlots: migratedSlots },
    lookups: { ...lookups, visualSlots: visualSlotLookup }
  } as unknown as CompiledRigProjectV1;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
