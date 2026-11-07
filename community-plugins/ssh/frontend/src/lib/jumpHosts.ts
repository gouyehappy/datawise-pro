/**
 * Client-side ProxyJump (`jump_hosts`) JSON validation.
 * Mirrors backend `parse_jump_hosts` / `JumpHost::validate` so the connection
 * form textarea can fail fast with a readable message before connect.
 */

export type JumpHostAuth = "password" | "private-key" | "private-key-password" | "agent";

export type JumpHostDraft = {
  host: string;
  port: number;
  username: string;
  authentication: JumpHostAuth;
  password?: string;
  private_key_path?: string;
};

export type JumpHostsValidation =
  | { ok: true; hops: JumpHostDraft[] }
  | { ok: false; error: string };

const AUTH_METHODS = new Set<JumpHostAuth>([
  "password",
  "private-key",
  "private-key-password",
  "agent",
]);

function asAuth(raw: unknown): JumpHostAuth | null {
  if (typeof raw !== "string" || !raw.trim()) return "password";
  return AUTH_METHODS.has(raw as JumpHostAuth) ? (raw as JumpHostAuth) : null;
}

function validateHost(host: string): string | null {
  if (!host) return "each hop needs a non-empty host";
  if (/\s/.test(host)) return `invalid host '${host}': must not contain whitespace`;
  if (host.includes("://")) return `invalid host '${host}': use a bare hostname, not a URI`;
  return null;
}

function parseHop(value: unknown, index: number): JumpHostDraft | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `Jump host #${index + 1} must be an object`;
  }
  const row = value as Record<string, unknown>;
  const host = typeof row.host === "string" ? row.host.trim() : "";
  const hostError = validateHost(host);
  if (hostError) return `Jump host #${index + 1}: ${hostError}`;

  let port = 22;
  if (row.port !== undefined && row.port !== null) {
    const n = typeof row.port === "number" ? row.port : Number(row.port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return `Jump host #${index + 1} (${host}): port must be between 1 and 65535`;
    }
    port = n;
  }

  const username = typeof row.username === "string" ? row.username.trim() : "";
  if (!username) return `Jump host #${index + 1} (${host}): missing username`;

  const authentication = asAuth(row.authentication);
  if (!authentication) {
    return `Jump host #${index + 1} (${host}): unsupported authentication method`;
  }

  const password = typeof row.password === "string" ? row.password : "";
  const privateKeyPath =
    typeof row.private_key_path === "string" ? row.private_key_path.trim() : "";

  if (authentication === "password" && !password) {
    return `Jump host #${index + 1} (${host}) requires a password`;
  }
  if (
    (authentication === "private-key" || authentication === "private-key-password")
    && !privateKeyPath
  ) {
    return `Jump host #${index + 1} (${host}) requires private_key_path`;
  }
  if (authentication === "private-key-password" && !password && !row.private_key_passphrase) {
    // Backend may accept empty passphrase for unencrypted keys labelled
    // private-key-password; require path only (already checked).
  }

  return {
    host,
    port,
    username,
    authentication,
    password: password || undefined,
    private_key_path: privateKeyPath || undefined,
  };
}

/** Validate connection-form textarea text or a parsed JSON value. */
export function validateJumpHosts(raw: unknown): JumpHostsValidation {
  if (raw == null) return { ok: true, hops: [] };

  let list: unknown[];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, hops: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (cause) {
      return {
        ok: false,
        error: `jump_hosts must be a JSON array of hop objects: ${cause instanceof Error ? cause.message : String(cause)}`,
      };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "jump_hosts must be a JSON array of hop objects" };
    }
    list = parsed;
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    return { ok: false, error: "jump_hosts must be a JSON array or JSON text" };
  }

  if (list.length > 3) {
    return { ok: false, error: "At most 3 jump hosts are supported" };
  }

  const hops: JumpHostDraft[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    const hop = parseHop(list[i], i);
    if (typeof hop === "string") return { ok: false, error: hop };
    const key = `${hop.host}:${hop.port}`;
    if (seen.has(key)) {
      return {
        ok: false,
        error: `Jump host #${i + 1} (${hop.host}) repeats an earlier hop`,
      };
    }
    seen.add(key);
    hops.push(hop);
  }
  return { ok: true, hops };
}

export function validateJumpHostsText(text: string): JumpHostsValidation {
  return validateJumpHosts(text);
}
