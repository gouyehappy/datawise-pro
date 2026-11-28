/**
 * Motty-style paste-image assist (S-PASTEIMG): clipboard image → local file
 * (Local Shell) or SFTP upload (SSH), then insert a shell-quoted path into the PTY.
 *
 * Product rules (parity doc):
 * - Default off (opt-in).
 * - Local Shell: write via `local/saveFile`, inject host path.
 * - SSH: upload to remote cwd, inject remote path (never inject a host path into a remote shell).
 * - Telnet / Serial / VNC: unsupported (honest no-op + caller notice).
 */

export const PASTE_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB
export const PASTE_IMAGE_MIME = /^(image\/(png|jpeg|jpg|gif|webp))$/i;

export type PasteImageSessionKind = "local" | "ssh" | "unsupported";

export type PasteImagePick =
  | { ok: true; file: File }
  | { ok: false; reason: "none" | "too-large" | "not-image" };

/** Prefer the first image/* File under the size cap. */
export function pickPasteImage(files: readonly File[]): PasteImagePick {
  if (!files.length) return { ok: false, reason: "none" };
  for (const file of files) {
    const type = (file.type || "").trim();
    const name = file.name || "";
    const looksImage = PASTE_IMAGE_MIME.test(type) || /\.(png|jpe?g|gif|webp)$/i.test(name);
    if (!looksImage) continue;
    if (file.size <= 0) continue;
    if (file.size > PASTE_IMAGE_MAX_BYTES) return { ok: false, reason: "too-large" };
    return { ok: true, file };
  }
  return { ok: false, reason: "not-image" };
}

/** Map workbench session shape onto paste-image policy. */
export function resolvePasteImageKind(input: {
  sshConnected: boolean;
  protocolKind?: string | null;
}): PasteImageSessionKind {
  if (input.protocolKind === "local") return "local";
  if (input.sshConnected) return "ssh";
  return "unsupported";
}

/** Stable, shell-friendly filename (no spaces). */
export function pasteImageFileName(file: File, now: Date = new Date()): string {
  const extFromType = mimeToExt(file.type);
  const extFromName = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  const ext = extFromType || (["png", "jpg", "jpeg", "gif", "webp"].includes(extFromName) ? extFromName === "jpeg" ? "jpg" : extFromName : "png");
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const rand = Math.random().toString(36).slice(2, 8);
  return `paste-${stamp}-${rand}.${ext}`;
}

function mimeToExt(mime: string): string | null {
  switch ((mime || "").toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/** POSIX-ish single-quote escaping for inserting a path into the shell. */
export function shellQuotePath(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/**
 * Text written to the PTY after a successful paste-image save/upload.
 * Trailing space makes it easy to continue typing args.
 */
export function pasteImageInsertText(absolutePath: string): string {
  return `${shellQuotePath(absolutePath)} `;
}
