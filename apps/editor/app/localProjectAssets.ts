import type { ProjectAssetMetadata } from "./projectPersistence";

const databaseName = "bones-local-assets-v1";
const handleStore = "handles";
const workspaceRootKey = "workspace-root";

interface FileSystemHandleWithPermission extends FileSystemHandle {
  queryPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
}

export interface StoredProjectAsset {
  readonly metadata: ProjectAssetMetadata;
  readonly objectUrl: string;
}

type ImageBitmapFactory = (image: ImageBitmapSource) => Promise<Pick<ImageBitmap, "width" | "height" | "close">>;

export function supportsProjectFolders(): boolean {
  return typeof window !== "undefined" && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function chooseWorkspaceRoot(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Project folders require Chrome or Edge.");
  const handle = await picker({ id: "bones-workspace", mode: "readwrite" });
  await saveHandle(workspaceRootKey, handle);
  return handle;
}

export async function ensureProjectDirectory(projectId: string, projectName: string, requestPermission = false): Promise<FileSystemDirectoryHandle> {
  const saved = await loadHandle<FileSystemDirectoryHandle>(`project:${projectId}`);
  if (saved && await hasPermission(saved, requestPermission)) return saved;
  const root = await loadHandle<FileSystemDirectoryHandle>(workspaceRootKey);
  if (!root || !await hasPermission(root, requestPermission)) throw new Error("Reconnect the workspace folder first.");
  const directory = await root.getDirectoryHandle(`${slug(projectName)}-${projectId.slice(0, 8)}`, { create: true });
  await directory.getDirectoryHandle("assets", { create: true });
  await saveHandle(`project:${projectId}`, directory);
  return directory;
}

export async function connectProjectFolder(projectId: string, projectName: string): Promise<FileSystemDirectoryHandle> {
  let root = await loadHandle<FileSystemDirectoryHandle>(workspaceRootKey);
  if (!root || !await hasPermission(root, true)) root = await chooseWorkspaceRoot();
  const directory = await root.getDirectoryHandle(`${slug(projectName)}-${projectId.slice(0, 8)}`, { create: true });
  await directory.getDirectoryHandle("assets", { create: true });
  await saveHandle(`project:${projectId}`, directory);
  return directory;
}

export async function writeProjectAsset(projectId: string, projectName: string, file: File): Promise<StoredProjectAsset> {
  const intrinsicSize = await readRasterIntrinsicSize(file);
  const project = await ensureProjectDirectory(projectId, projectName, true);
  const assets = await project.getDirectoryHandle("assets", { create: true });
  const assetId = globalThis.crypto.randomUUID();
  const fileName = `${assetId.slice(0, 8)}-${safeFileName(file.name)}`;
  const handle = await assets.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  const checksum = await sha256(file);
  return {
    metadata: buildProjectAssetMetadata(assetId, `assets/${fileName}`, file, checksum, intrinsicSize),
    objectUrl: URL.createObjectURL(file)
  };
}

export function buildProjectAssetMetadata(
  id: string,
  relativePath: string,
  file: File,
  checksum: string,
  intrinsicSize?: { readonly width: number; readonly height: number }
): ProjectAssetMetadata {
  return {
    id,
    relativePath,
    originalName: file.name,
    mimeType: file.type || mimeFromName(file.name),
    byteSize: file.size,
    checksum,
    ...(intrinsicSize ? { width: intrinsicSize.width, height: intrinsicSize.height } : {})
  };
}

export async function readRasterIntrinsicSize(file: File, bitmapFactory: ImageBitmapFactory = globalThis.createImageBitmap): Promise<{ readonly width: number; readonly height: number } | undefined> {
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) return undefined;
  const bitmap = await bitmapFactory(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) throw new Error("PNG dimensions must be positive.");
  return size;
}

export async function resolveProjectAssetUrl(projectId: string, projectName: string, relativePath: string): Promise<string> {
  if (!relativePath.startsWith("assets/") || relativePath.includes("..")) return relativePath;
  const project = await ensureProjectDirectory(projectId, projectName, false);
  const [directoryName, fileName] = relativePath.split("/");
  if (directoryName !== "assets" || !fileName) throw new Error(`Invalid asset path '${relativePath}'.`);
  const assets = await project.getDirectoryHandle("assets");
  const handle = await assets.getFileHandle(fileName);
  return URL.createObjectURL(await handle.getFile());
}

async function hasPermission(handle: FileSystemHandle, request: boolean): Promise<boolean> {
  const permissionHandle = handle as FileSystemHandleWithPermission;
  if (typeof permissionHandle.queryPermission !== "function") return true;
  const current = await permissionHandle.queryPermission({ mode: "readwrite" });
  if (current === "granted") return true;
  return request && await permissionHandle.requestPermission({ mode: "readwrite" }) === "granted";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(handleStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local asset database."));
  });
}

async function saveHandle(key: string, handle: FileSystemHandle): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(handleStore, "readwrite");
    transaction.objectStore(handleStore).put(handle, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save folder permission."));
  });
  db.close();
}

async function loadHandle<T extends FileSystemHandle>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(handleStore, "readonly").objectStore(handleStore).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read folder permission."));
  });
  db.close();
  return value;
}

async function sha256(file: Blob): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "untitled-rig";
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-96) || "asset.bin";
}

function mimeFromName(value: string): string {
  if (value.toLowerCase().endsWith(".svg")) return "image/svg+xml";
  if (value.toLowerCase().endsWith(".png")) return "image/png";
  return "application/octet-stream";
}
