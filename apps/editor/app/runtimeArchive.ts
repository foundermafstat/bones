import { zipSync } from "fflate";

export interface RuntimeArchiveEntry {
  readonly path: string;
  readonly data: string | Uint8Array;
}

export interface RuntimeArchiveOptions {
  readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

const textEncoder = new TextEncoder();

export function createDeflateZip(entries: readonly RuntimeArchiveEntry[], options: RuntimeArchiveOptions = {}): Uint8Array<ArrayBuffer> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    const path = normalizeArchivePath(entry.path);
    if (files[path]) {
      throw new Error(`Duplicate archive path '${path}'.`);
    }
    files[path] = typeof entry.data === "string" ? textEncoder.encode(entry.data) : entry.data;
  }
  return zipSync(files, {
    level: options.level ?? 6,
    mtime: new Date(2020, 0, 1)
  });
}

export function createDeflateZipBlob(entries: readonly RuntimeArchiveEntry[], options?: RuntimeArchiveOptions): Blob {
  return new Blob([createDeflateZip(entries, options)], { type: "application/zip" });
}

function normalizeArchivePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`Invalid archive path '${path}'.`);
  }
  return normalized;
}
