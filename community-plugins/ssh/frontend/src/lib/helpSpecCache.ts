/**
 * Bounded, fail-closed persistence for remote `--help` specs (beta.44).
 *
 * The scheduler's cache is memory-only with a 5 minute TTL. This module lets a
 * successful parse survive a webview reload / workbench remount without ever
 * persisting the raw remote output:
 *
 *  - Only the *parsed* structure is stored: scope key, validated command name,
 *    flag labels and descriptions. The raw `--help` text never crosses into
 *    storage, and control characters / secret-like values are stripped.
 *  - Every field is re-validated on restore (version, allowlist shape, flag
 *    shape, timestamp freshness, caps). Malformed documents yield no entries.
 *  - Bounded by entry count and serialized byte size; oversize snapshots are
 *    trimmed oldest-first instead of being dropped wholesale.
 *  - Scope keys (session ids) are kept, so a spec learned on one host is never
 *    served on another after a reload.
 */

import type { ArgumentFlagHint } from "./argumentHint";
import {
  HELP_SPEC_MAX_DESCRIPTION,
  HELP_SPEC_MAX_FLAG_CHARS,
  HELP_SPEC_MAX_FLAGS,
  isHelpSpecCommand,
} from "./helpSpec";
import {
  HELP_SPEC_SCOPE_MAX_LENGTH,
  HELP_SPEC_TTL_MS,
  type PersistedHelpSpec,
} from "./helpSpecScheduler";

export const HELP_SPEC_CACHE_KEY = "dw.ssh.helpSpecCache";
export const HELP_SPEC_CACHE_VERSION = 1;
export const HELP_SPEC_CACHE_MAX_ENTRIES = 24;
export const HELP_SPEC_CACHE_MAX_BYTES = 64 * 1024;

const SECRET_LIKE = /(?:password|passwd|passphrase|token|secret|api[-_]?key|access[-_]?key)\s*[:=]\s*\S/i;

function byteLength(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

function cleanFlag(raw: unknown): ArgumentFlagHint | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { flag?: unknown; description?: unknown };
  const flag = cleanText(record.flag, HELP_SPEC_MAX_FLAG_CHARS).trim();
  if (!flag) return null;
  const description = cleanText(record.description, HELP_SPEC_MAX_DESCRIPTION);
  // A help line that embeds an actual credential value is not worth storing.
  return { flag, description: SECRET_LIKE.test(description) ? "" : description };
}

function normalizeEntry(raw: unknown, now: number): PersistedHelpSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { key?: unknown; command?: unknown; flags?: unknown; at?: unknown };
  const command = record.command;
  if (!isHelpSpecCommand(command)) return null;
  const key = typeof record.key === "string" ? cleanText(record.key, HELP_SPEC_SCOPE_MAX_LENGTH) : "";
  const at = typeof record.at === "number" && Number.isFinite(record.at) ? Math.trunc(record.at) : Number.NaN;
  // Reject unknown, stale and implausibly-future timestamps.
  if (!Number.isFinite(at) || at < 0 || at > now + 60_000 || now - at >= HELP_SPEC_TTL_MS) return null;
  if (!Array.isArray(record.flags)) return null;
  const flags: ArgumentFlagHint[] = [];
  for (const item of record.flags.slice(0, HELP_SPEC_MAX_FLAGS)) {
    const flag = cleanFlag(item);
    if (flag) flags.push(flag);
  }
  if (!flags.length) return null;
  return { key, command, flags, at };
}

/** Serialize successful cache entries. Returns null when nothing is worth storing. */
export function serializeHelpSpecCache(
  specs: readonly PersistedHelpSpec[] | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!Array.isArray(specs)) return null;
  const seen = new Set<string>();
  const entries: PersistedHelpSpec[] = [];
  for (const raw of [...specs].sort((a, b) => (b?.at ?? 0) - (a?.at ?? 0))) {
    const entry = normalizeEntry(raw, now);
    if (!entry) continue;
    const id = `${entry.key}:${entry.command}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push(entry);
    if (entries.length >= HELP_SPEC_CACHE_MAX_ENTRIES) break;
  }
  if (!entries.length) return null;
  const encode = () => JSON.stringify({ v: HELP_SPEC_CACHE_VERSION, entries });
  let serialized = encode();
  while (byteLength(serialized) > HELP_SPEC_CACHE_MAX_BYTES && entries.length > 1) {
    entries.pop(); // oldest first (sorted by at desc)
    serialized = encode();
  }
  return byteLength(serialized) <= HELP_SPEC_CACHE_MAX_BYTES ? serialized : null;
}

/** Restore validated entries. Any structural corruption fails closed to []. */
export function restoreHelpSpecCache(raw: unknown, now: number = Date.now()): PersistedHelpSpec[] {
  if (typeof raw !== "string" || !raw || byteLength(raw) > HELP_SPEC_CACHE_MAX_BYTES * 2) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const doc = parsed as { v?: unknown; entries?: unknown };
  if (doc.v !== HELP_SPEC_CACHE_VERSION || !Array.isArray(doc.entries)) return [];
  const byId = new Map<string, PersistedHelpSpec>();
  for (const item of doc.entries.slice(0, HELP_SPEC_CACHE_MAX_ENTRIES * 2)) {
    const entry = normalizeEntry(item, now);
    if (!entry) continue;
    const id = `${entry.key}:${entry.command}`;
    const prev = byId.get(id);
    // Keep the freshest stamp regardless of document order.
    if (!prev || prev.at < entry.at) byId.set(id, entry);
  }
  return [...byId.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, HELP_SPEC_CACHE_MAX_ENTRIES);
}
