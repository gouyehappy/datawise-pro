/** SSH config 双向同步的 RPC 契约与纯映射逻辑（零 UI/SSH 依赖）。 */

export type SshConfigHostView = {
  alias: string;
  host: string;
  user: string;
  port: number;
  identityFile: string;
  proxyJump: string;
  managed: boolean;
};

export type SshConfigStamp = { exists: boolean; size: number; modified: number };

export type SshConfigReadResult = {
  enabled: boolean;
  path: string;
  configPath: string;
  exists: boolean;
  stamp: SshConfigStamp;
  hosts: SshConfigHostView[];
  links: Array<{ id: string; alias: string; detached: boolean; base: Record<string, unknown> }>;
  ignored: string[];
  notes: string[];
  managedBegin: string;
  managedEnd: string;
};

export type SshConfigImportSession = {
  name: string;
  host: string;
  port: number;
  username: string;
  authKind: string;
  keyPath: string;
  description: string;
};

export type SshConfigImportResult = {
  sessions: SshConfigImportSession[];
  notes: string[];
  stamp: SshConfigStamp;
};

export type SshConfigExportResult = {
  success: boolean;
  path: string;
  backup: string;
  wrote: number;
  stamp: SshConfigStamp;
};

export type SshConfigSettingsResult = {
  enabled: boolean;
  path: string | null;
  links: unknown[];
  ignored: string[];
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseSshConfigRead(payload: unknown): SshConfigReadResult | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const hosts = Array.isArray(raw.hosts) ? raw.hosts : [];
  return {
    enabled: raw.enabled === true,
    path: asText(raw.path),
    configPath: asText(raw.configPath),
    exists: raw.exists === true,
    stamp: parseStamp(raw.stamp),
    hosts: hosts.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        alias: asText(entry.alias),
        host: asText(entry.host),
        user: asText(entry.user),
        port: typeof entry.port === "number" && Number.isFinite(entry.port) ? entry.port : 22,
        identityFile: asText(entry.identityFile),
        proxyJump: asText(entry.proxyJump),
        managed: entry.managed === true,
      })),
    links: Array.isArray(raw.links) ? raw.links.filter((entry): entry is { id: string; alias: string; detached: boolean; base: Record<string, unknown> } => !!entry && typeof entry === "object") : [],
    ignored: Array.isArray(raw.ignored) ? raw.ignored.filter((value): value is string => typeof value === "string") : [],
    notes: Array.isArray(raw.notes) ? raw.notes.filter((value): value is string => typeof value === "string") : [],
    managedBegin: asText(raw.managedBegin),
    managedEnd: asText(raw.managedEnd),
  };
}

function parseStamp(value: unknown): SshConfigStamp {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    exists: raw.exists === true,
    size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
    modified: typeof raw.modified === "number" && Number.isFinite(raw.modified) ? raw.modified : 0,
  };
}

export function parseSshConfigImport(payload: unknown): SshConfigImportResult {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  return {
    sessions: sessions.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        name: asText(entry.name),
        host: asText(entry.host),
        port: typeof entry.port === "number" && Number.isFinite(entry.port) ? entry.port : 22,
        username: asText(entry.username),
        authKind: asText(entry.authKind),
        keyPath: asText(entry.keyPath),
        description: asText(entry.description),
      })),
    notes: Array.isArray(raw.notes) ? raw.notes.filter((value): value is string => typeof value === "string") : [],
    stamp: parseStamp(raw.stamp),
  };
}

export function parseSshConfigExport(payload: unknown): SshConfigExportResult | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  return {
    success: raw.success === true,
    path: asText(raw.path),
    backup: asText(raw.backup),
    wrote: typeof raw.wrote === "number" && Number.isFinite(raw.wrote) ? raw.wrote : 0,
    stamp: parseStamp(raw.stamp),
  };
}

/** Map preview sessions into host connection drafts (no credentials carried). */
export function sshConfigHostDrafts(
  sessions: SshConfigImportSession[],
): Array<Record<string, unknown>> {
  const stamp = Date.now();
  return sessions
    .filter((session) => session.host.trim().length > 0)
    .map((session, index) => {
      const port = session.port > 0 && session.port <= 65535 ? Math.floor(session.port) : 22;
      const authKind = session.authKind === "private-key" ? "private-key" : "password";
      const advanced: Record<string, string> = {
        bastion_mode: "direct",
        authentication: authKind,
      };
      if (session.keyPath && authKind === "private-key") {
        advanced.private_key_path = session.keyPath;
      }
      return {
        id: `sshconfig-sync-${stamp}-${index}`,
        name: session.name.trim() || session.host.trim(),
        dbType: "plugin",
        env: "dev",
        storage: "LOCAL",
        host: session.host.trim(),
        port: String(port),
        auth: "User&Password",
        user: session.username.trim() || "root",
        password: "",
        url: "",
        pluginId: "io.datawise.community.ssh",
        pluginConnectionProvider: "io.datawise.community.ssh.connection",
        advancedConfig: JSON.stringify(advanced),
      };
    });
}

export function settingsErrorOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  const raw = typeof cause === "object" && cause ? cause as Record<string, unknown> : null;
  if (raw && typeof raw.message === "string") return raw.message;
  return String(cause ?? "unknown error");
}
