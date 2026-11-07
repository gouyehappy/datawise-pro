/** Bounds for drag-and-drop folder walks . */
export const FOLDER_DROP_MAX_FILES = 50_000;
export const FOLDER_DROP_MAX_DEPTH = 64;

export type FolderDropFile = {
  relativePath: string;
  file: File;
};

export type FolderDropPlan =
  | { kind: "files"; files: File[] }
  | { kind: "folder"; files: FolderDropFile[]; emptyDirs: string[] }
  | { kind: "empty-folder" }
  | { kind: "too-large"; reason: "files" | "depth" };

type FileSystemFileEntryLike = {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (ok: (file: File) => void, err?: (error: DOMException) => void) => void;
};

type FileSystemDirectoryEntryLike = {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => {
    readEntries: (
      ok: (entries: FileSystemEntryLike[]) => void,
      err?: (error: DOMException) => void,
    ) => void;
  };
};

export type FileSystemEntryLike =
  | FileSystemFileEntryLike
  | FileSystemDirectoryEntryLike
  | { isFile: boolean; isDirectory: boolean; name: string };

/** Strip `..` / absolute prefixes so a drop cannot escape the landing directory. */
export function sanitizeRelativePath(path: string): string | null {
  const trimmed = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split("/").filter((part) => part && part !== ".");
  if (!parts.length) return null;
  if (parts.some((part) => part === "..")) return null;
  if (parts.some((part) => part.includes("\0"))) return null;
  return parts.join("/");
}

export function classifyDropEntries(relativePaths: string[]): "files" | "folder" | "empty-folder" {
  const cleaned = relativePaths.map(sanitizeRelativePath).filter((path): path is string => Boolean(path));
  if (!cleaned.length) return "empty-folder";
  const nested = cleaned.some((path) => path.includes("/"));
  return nested ? "folder" : "files";
}

export async function readAllDirectoryEntries(
  reader: FileSystemDirectoryEntryLike["createReader"] extends () => infer R ? R : never,
): Promise<FileSystemEntryLike[]> {
  const collected: FileSystemEntryLike[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, (error) => reject(error));
    });
    if (!batch.length) break;
    collected.push(...batch);
  }
  return collected;
}

async function walkEntry(
  entry: FileSystemEntryLike,
  prefix: string,
  depth: number,
  out: FolderDropFile[],
  emptyDirs: string[],
): Promise<"ok" | "files" | "depth"> {
  if (depth > FOLDER_DROP_MAX_DEPTH) return "depth";
  if (out.length >= FOLDER_DROP_MAX_FILES) return "files";
  if (entry.isFile && "file" in entry) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntryLike).file(resolve, (error) => reject(error));
    });
    const relativePath = sanitizeRelativePath(prefix ? `${prefix}/${file.name}` : file.name);
    if (relativePath) out.push({ relativePath, file });
    return out.length > FOLDER_DROP_MAX_FILES ? "files" : "ok";
  }
  if (entry.isDirectory && "createReader" in entry) {
    const dir = entry as FileSystemDirectoryEntryLike;
    const nextPrefix = prefix ? `${prefix}/${dir.name}` : dir.name;
    const children = await readAllDirectoryEntries(dir.createReader());
    const dirPath = sanitizeRelativePath(nextPrefix);
    if (!children.length && dirPath) emptyDirs.push(dirPath);
    for (const child of children) {
      const result = await walkEntry(child, nextPrefix, depth + 1, out, emptyDirs);
      if (result !== "ok") return result;
    }
  }
  return "ok";
}

function entryFromItem(item: DataTransferItem): FileSystemEntryLike | null {
  const withEntry = item as DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntryLike | null;
  };
  if (typeof withEntry.webkitGetAsEntry === "function") {
    return withEntry.webkitGetAsEntry();
  }
  return null;
}

/**
 * Inspect a DOM drop. Directory entries use `webkitGetAsEntry`; browsers that
 * only expose `dataTransfer.files` keep the old flat-file semantics.
 */
export async function planFolderDrop(dataTransfer: DataTransfer | null): Promise<FolderDropPlan> {
  if (!dataTransfer) return { kind: "files", files: [] };
  const items = dataTransfer.items;
  const roots: FileSystemEntryLike[] = [];
  if (items && items.length) {
    for (let index = 0; index < items.length; index += 1) {
      const entry = entryFromItem(items[index]!);
      if (entry) roots.push(entry);
    }
  }
  if (!roots.length) {
    return { kind: "files", files: Array.from(dataTransfer.files || []) };
  }
  const hasDirectory = roots.some((entry) => entry.isDirectory);
  if (!hasDirectory) {
    return { kind: "files", files: Array.from(dataTransfer.files || []) };
  }
  const collected: FolderDropFile[] = [];
  const emptyDirs: string[] = [];
  for (const root of roots) {
    const result = await walkEntry(root, "", 0, collected, emptyDirs);
    if (result !== "ok") return { kind: "too-large", reason: result };
  }
  if (!collected.length && !emptyDirs.length) return { kind: "empty-folder" };
  return { kind: "folder", files: collected, emptyDirs };
}

export function parentDirsOf(relativePath: string): string[] {
  const clean = sanitizeRelativePath(relativePath);
  if (!clean || !clean.includes("/")) return [];
  const parts = clean.split("/");
  parts.pop();
  const dirs: string[] = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    dirs.push(current);
  }
  return dirs;
}
