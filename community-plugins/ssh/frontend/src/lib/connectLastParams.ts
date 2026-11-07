/** Persist last in-plugin connect dialog fields (telnet/serial/vnc/rdp). */

const PREFIX = "ssh.connectLast.";

export function loadLastConnectParams<T extends object>(kind: string): Partial<T> {
  try {
    const raw = localStorage.getItem(PREFIX + kind);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

export function persistLastConnectParams(kind: string, params: object): void {
  try {
    // Never persist secrets.
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (/password|secret|token/i.test(key)) continue;
      safe[key] = value;
    }
    localStorage.setItem(PREFIX + kind, JSON.stringify(safe));
  } catch {
    // ignore quota / private mode
  }
}
