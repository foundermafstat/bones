import { BONES_COMPILED_FORMAT_VERSION, type CompiledRigProjectV1 } from "./types.js";

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

  if (input.compiledFormatVersion !== BONES_COMPILED_FORMAT_VERSION) {
    throw new CompiledMigrationError(
      `Unsupported compiledFormatVersion '${String(input.compiledFormatVersion)}'. Expected '${BONES_COMPILED_FORMAT_VERSION}'.`
    );
  }

  return input as unknown as CompiledRigProjectV1;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
