/** Connection-scoped startup commands (Tabby Login scripts parity). */

export const STARTUP_COMMANDS_LIMIT = 20;
export const STARTUP_COMMAND_MAX_CHARS = 4096;
export const STARTUP_DELAY_DEFAULT_MS = 300;
export const STARTUP_DELAY_MAX_MS = 30_000;

export interface StartupCommandRow {
  command: string;
  delayMs: number;
  enabled: boolean;
}

export interface StartupCommandsBucket {
  enabled: boolean;
  commands: StartupCommandRow[];
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trimEnd().replace(/[\r\n]+$/g, "") : "";
}

function clampDelay(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return STARTUP_DELAY_DEFAULT_MS;
  return Math.min(STARTUP_DELAY_MAX_MS, Math.round(n));
}

export function emptyStartupBucket(): StartupCommandsBucket {
  return { enabled: false, commands: [] };
}

export function sanitizeStartupRow(raw: unknown): StartupCommandRow | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const command = nonEmptyString(record.command).slice(0, STARTUP_COMMAND_MAX_CHARS);
  if (!command.trim()) return null;
  return {
    command,
    delayMs: clampDelay(record.delayMs),
    enabled: record.enabled !== false,
  };
}

export function sanitizeStartupBucket(raw: unknown): StartupCommandsBucket {
  if (!raw || typeof raw !== "object") return emptyStartupBucket();
  const record = raw as Record<string, unknown>;
  const commands = Array.isArray(record.commands)
    ? record.commands.map(sanitizeStartupRow).filter((row): row is StartupCommandRow => !!row).slice(0, STARTUP_COMMANDS_LIMIT)
    : [];
  return {
    enabled: record.enabled === true,
    commands,
  };
}

/** Merge one connection bucket into the full preference object for save. */
export function mergeStartupStore(
  store: unknown,
  connectionId: string,
  bucket: StartupCommandsBucket,
): Record<string, StartupCommandsBucket> {
  const out: Record<string, StartupCommandsBucket> = {};
  if (store && typeof store === "object" && !Array.isArray(store)) {
    for (const [id, value] of Object.entries(store as Record<string, unknown>)) {
      if (Object.keys(out).length >= 512) break;
      out[id] = sanitizeStartupBucket(value);
    }
  }
  const id = connectionId.trim();
  if (id) out[id] = sanitizeStartupBucket(bucket);
  return out;
}

export function canAddStartupCommand(bucket: StartupCommandsBucket): boolean {
  return bucket.commands.length < STARTUP_COMMANDS_LIMIT;
}
