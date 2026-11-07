/** Session-import preview helpers (streaming upload + sanitized row parse). */

export type ImportKind =
  | "moba"
  | "xshell"
  | "windterm"
  | "securecrt"
  | "finalshell"
  | "electerm"
  | "termius"
  | "sshconfig";

export const IMPORT_TOTAL_LIMIT = 64 * 1024 * 1024;
export const IMPORT_CHUNK_LIMIT = 256 * 1024;

export interface ImportSessionView {
  index: number;
  name: string;
  host: string;
  port: number | null;
  username: string;
  groupPath: string;
  description: string;
  authKind: string;
  hasSecret: boolean;
  secretNote: string;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseSessionView(raw: unknown, index: number): ImportSessionView | null {
  if (!raw || typeof raw !== "object") return null;
  const view = raw as Record<string, unknown>;
  const port = typeof view.port === "number" && Number.isFinite(view.port) ? view.port : null;
  return {
    index: typeof view.index === "number" && Number.isFinite(view.index) ? view.index : index,
    name: asText(view.name),
    host: asText(view.host),
    port,
    username: asText(view.username),
    groupPath: asText(view.groupPath),
    description: asText(view.description),
    authKind: asText(view.authKind),
    hasSecret: view.hasSecret === true,
    secretNote: asText(view.secretNote),
  };
}

/** Parse sanitized rows from `import/preview/finish`. */
export function parseImportSessions(payload: unknown): ImportSessionView[] {
  const list = (payload as { sessions?: unknown } | null | undefined)?.sessions;
  return Array.isArray(list)
    ? list.map(parseSessionView).filter((session): session is ImportSessionView => session !== null)
    : [];
}

/** Start streaming preview: main file + optional WindTerm user.config share a 64 MiB budget. */
export function importPreviewStartParams(
  kind: ImportKind,
  mainSize: number,
  userConfigSize: number,
  masterPassword: string,
): Record<string, unknown> {
  const safeMain = Math.max(0, Math.floor(mainSize));
  const safeConfig = Math.max(0, Math.floor(userConfigSize));
  if (safeMain + safeConfig > IMPORT_TOTAL_LIMIT) throw new Error("import-size-limit");
  const params: Record<string, unknown> = { kind, mainSize: safeMain };
  if (kind === "windterm" && safeConfig) params.userConfigSize = safeConfig;
  if (kind === "windterm" && masterPassword) params.masterPassword = masterPassword;
  return params;
}

/** Binary frame: 8-byte BE offset then up to 256 KiB raw bytes. */
export function importPreviewChunk(offset: number, bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength > IMPORT_CHUNK_LIMIT) throw new Error("import-chunk-limit");
  const frame = new Uint8Array(8 + bytes.byteLength);
  const view = new DataView(frame.buffer);
  view.setBigUint64(0, BigInt(offset));
  frame.set(bytes, 8);
  return frame;
}

/** Params for the preferred RPC chunk path (`import/preview/chunk`). */
export function importPreviewChunkParams(
  taskId: string,
  part: "main" | "user-config",
  offset: number,
  bytes: Uint8Array,
): Record<string, unknown> {
  if (bytes.byteLength > IMPORT_CHUNK_LIMIT) throw new Error("import-chunk-limit");
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return {
    taskId,
    part,
    offset: Math.max(0, Math.floor(offset)),
    dataBase64: btoa(binary),
  };
}

/** Map known WindTerm / size errors to i18n codes. */
export function importErrorCode(error: unknown): "" | "masterPassword" | "sizeLimit" {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/master password/i.test(message)) return "masterPassword";
  return /64\s*MiB|exceed.*limit|size-limit/i.test(message) ? "sizeLimit" : "";
}

const SSH_PLUGIN_ID = "io.datawise.community.ssh";
const SSH_CONNECTION_PROVIDER = "io.datawise.community.ssh.connection";

/** One host ConnectionConfig-shaped row for `host.importConnections`. */
export type HostConnectionDraft = {
  id: string;
  name: string;
  dbType: "plugin";
  env: string;
  storage: string;
  host: string;
  port: string;
  auth: string;
  user: string;
  password: string;
  url: string;
  pluginId: string;
  pluginConnectionProvider: string;
  advancedConfig: string;
};

type NormalizedExportSession = {
  name?: unknown;
  host?: unknown;
  port?: unknown;
  username?: unknown;
  auth?: { kind?: unknown; keyPath?: unknown; hasSecret?: unknown };
};

/**
 * Map sanitized import preview/export rows into host ConnectionConfig drafts.
 * Secrets are never carried — authentication kind + optional key path only.
 */
export function hostConnectionDraftsFromExport(
  normalizedExport: unknown,
  fallbackSessions: ImportSessionView[],
): HostConnectionDraft[] {
  const exportSessions = (normalizedExport as { sessions?: unknown } | null | undefined)?.sessions;
  const rows: Array<{
    name: string;
    host: string;
    port: number;
    username: string;
    authKind: string;
    keyPath: string;
  }> = [];
  if (Array.isArray(exportSessions) && exportSessions.length) {
    for (const raw of exportSessions) {
      if (!raw || typeof raw !== "object") continue;
      const session = raw as NormalizedExportSession;
      const host = asText(session.host).trim();
      if (!host) continue;
      const portRaw = typeof session.port === "number" && Number.isFinite(session.port) ? session.port : 22;
      const port = portRaw > 0 && portRaw <= 65535 ? Math.floor(portRaw) : 22;
      const authKind = asText(session.auth?.kind).trim() || "password";
      rows.push({
        name: asText(session.name).trim() || host,
        host,
        port,
        username: asText(session.username).trim() || "root",
        authKind: authKind === "private-key" || authKind === "private-key-password" || authKind === "none" || authKind === "password"
          ? authKind
          : "password",
        keyPath: asText(session.auth?.keyPath).trim(),
      });
    }
  } else {
    for (const session of fallbackSessions) {
      const host = session.host.trim();
      if (!host) continue;
      const port = session.port && session.port > 0 && session.port <= 65535 ? Math.floor(session.port) : 22;
      const authKind = session.authKind.trim() || "password";
      rows.push({
        name: session.name.trim() || host,
        host,
        port,
        username: session.username.trim() || "root",
        authKind: authKind === "private-key" || authKind === "private-key-password" || authKind === "none" || authKind === "password"
          ? authKind
          : "password",
        keyPath: "",
      });
    }
  }
  const stamp = Date.now();
  return rows.map((row, index) => {
    const advanced: Record<string, string> = {
      bastion_mode: "direct",
      authentication: row.authKind,
    };
    if (row.keyPath && (row.authKind === "private-key" || row.authKind === "private-key-password")) {
      advanced.private_key_path = row.keyPath;
    }
    return {
      id: `import-ssh-${stamp}-${index}`,
      name: row.name,
      dbType: "plugin",
      env: "dev",
      storage: "LOCAL",
      host: row.host,
      port: String(row.port),
      auth: "User&Password",
      user: row.username,
      password: "",
      url: "",
      pluginId: SSH_PLUGIN_ID,
      pluginConnectionProvider: SSH_CONNECTION_PROVIDER,
      advancedConfig: JSON.stringify(advanced),
    };
  });
}

/**
 * Ask the host to persist connection drafts into the workbench list.
 * Returns created count, or `null` when the host has no import/create API.
 */
export async function createHostConnectionsFromImport(
  drafts: HostConnectionDraft[],
): Promise<{ count: number } | null> {
  if (!drafts.length) return { count: 0 };
  const api = window.datawisePlugin;
  const methods = ["host.importConnections", "host.createConnections"] as const;
  let lastError: unknown = null;
  let sawUnavailable = false;
  for (const method of methods) {
    try {
      const result = await api.request<{ count?: number; imported?: number }>(method, {
        connections: drafts,
      });
      const count = typeof result?.count === "number"
        ? result.count
        : typeof result?.imported === "number"
          ? result.imported
          : drafts.length;
      return { count: Math.max(0, Math.floor(count)) };
    } catch (cause) {
      lastError = cause;
      const message = cause instanceof Error ? cause.message : String(cause ?? "");
      // Older hosts reject unknown host.* methods; treat as unavailable.
      if (/not (available|found|supported)|unknown method|Method not found|-32601/i.test(message)) {
        sawUnavailable = true;
        continue;
      }
      throw cause;
    }
  }
  if (sawUnavailable && !lastError) return null;
  if (sawUnavailable) return null;
  if (lastError) throw lastError;
  return null;
}
