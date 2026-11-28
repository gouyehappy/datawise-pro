/**
 * TTL / concurrency / failure cache for remote `--help` specs (beta.43).
 *
 * Pure orchestration: no timers, no host APIs, no DOM. `run` and `now` are
 * injected so the policy is fully testable. Every failure path returns null —
 * a slow or unreachable host must never stall or confuse the input overlay.
 */

import type { ArgumentFlagHint } from "./argumentHint";
import { isHelpSpecCommand, parseHelpFlags } from "./helpSpec";

export interface RemoteHelpSpec {
  command: string;
  flags: ArgumentFlagHint[];
  /** When the successful result was produced (epoch ms). */
  at: number;
}

/**
 * A cache entry as it crosses the persistence boundary (beta.44). `key` is
 * the scope (session id) so a spec learned on one host is never served on
 * another. Only the parsed result is stored — never the raw `--help` output.
 */
export interface PersistedHelpSpec {
  key: string;
  command: string;
  flags: ArgumentFlagHint[];
  at: number;
}

export interface HelpSpecSchedulerOptions {
  /** Perform `<command> --help` on the host; resolve with raw text or null. */
  run: (command: string) => Promise<string | null>;
  /** Injected for tests; defaults to the bounded parser in `helpSpec.ts`. */
  parse?: (text: string) => ArgumentFlagHint[];
  now?: () => number;
  /** Successful entries live this long. */
  ttlMs?: number;
  /** Failed / empty results are cached briefly to avoid hammering the host. */
  negativeTtlMs?: number;
  /** LRU-ish upper bound on cached entries. */
  maxEntries?: number;
  /** Concurrent host requests; excess callers get null instead of queueing. */
  maxInFlight?: number;
}

type CacheEntry = { at: number; spec: RemoteHelpSpec | null };

export interface HelpSpecScheduler {
  /** `key` isolates scopes (e.g. session id) so hosts never share a spec. */
  load(key: string, command: string): Promise<RemoteHelpSpec | null>;
  /** Inspect a cached entry without triggering a request. undefined = miss. */
  peek(key: string, command: string): RemoteHelpSpec | null | undefined;
  /** Drop all cached results (e.g. on disconnect). In-flight work is invalidated. */
  clear(): void;
  /** Successful entries only, in a form safe to hand to the persistence layer. */
  snapshot(): PersistedHelpSpec[];
  /** Restore previously validated entries (never overwrites a fresher hit). */
  seed(specs: readonly PersistedHelpSpec[]): void;
  readonly size: number;
  readonly inFlight: number;
}

export const HELP_SPEC_TTL_MS = 5 * 60_000;
export const HELP_SPEC_NEGATIVE_TTL_MS = 30_000;
export const HELP_SPEC_CACHE_MAX = 32;
export const HELP_SPEC_MAX_IN_FLIGHT = 2;
/** Scope keys are session ids (UUIDs); bound them before they reach storage. */
export const HELP_SPEC_SCOPE_MAX_LENGTH = 128;

export function createHelpSpecScheduler(options: HelpSpecSchedulerOptions): HelpSpecScheduler {
  const now = options.now ?? (() => Date.now());
  const parse = options.parse ?? parseHelpFlags;
  const ttlMs = Math.max(0, Math.floor(options.ttlMs ?? HELP_SPEC_TTL_MS));
  const negativeTtlMs = Math.max(0, Math.floor(options.negativeTtlMs ?? HELP_SPEC_NEGATIVE_TTL_MS));
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? HELP_SPEC_CACHE_MAX));
  const maxInFlight = Math.max(1, Math.floor(options.maxInFlight ?? HELP_SPEC_MAX_IN_FLIGHT));
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<RemoteHelpSpec | null>>();
  let generation = 0;

  const cacheKey = (key: string, command: string) => `${key}:${command}`;

  function evictOldest(): void {
    while (cache.size > maxEntries) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [entryKey, entry] of cache) {
        if (entry.at < oldestAt) {
          oldestAt = entry.at;
          oldestKey = entryKey;
        }
      }
      if (oldestKey === null) break;
      cache.delete(oldestKey);
    }
  }

  function load(key: string, command: string): Promise<RemoteHelpSpec | null> {
    // Hard gate: an unvalidated command must never reach `run`.
    if (!isHelpSpecCommand(command)) return Promise.resolve(null);
    const id = cacheKey(key, command);
    const hit = cache.get(id);
    if (hit) {
      const ttl = hit.spec ? ttlMs : negativeTtlMs;
      if (now() - hit.at < ttl) return Promise.resolve(hit.spec);
      cache.delete(id);
    }
    const inFlight = pending.get(id);
    if (inFlight) return inFlight;
    // Fail closed under load: never queue work behind a stalled host.
    if (pending.size >= maxInFlight) return Promise.resolve(null);

    const startedAt = generation;
    const task = (async (): Promise<RemoteHelpSpec | null> => {
      try {
        const text = await options.run(command);
        if (startedAt !== generation) return null;
        const flags = typeof text === "string" ? parse(text) : [];
        const spec: RemoteHelpSpec | null = flags.length ? { command, flags, at: now() } : null;
        cache.set(id, { at: now(), spec });
        evictOldest();
        return spec;
      } catch {
        if (startedAt !== generation) return null;
        cache.set(id, { at: now(), spec: null });
        evictOldest();
        return null;
      } finally {
        pending.delete(id);
      }
    })();
    pending.set(id, task);
    return task;
  }

  return {
    load,
    peek(key, command) {
      const hit = cache.get(cacheKey(key, command));
      if (!hit) return undefined;
      const ttl = hit.spec ? ttlMs : negativeTtlMs;
      if (now() - hit.at >= ttl) return undefined;
      return hit.spec;
    },
    clear() {
      generation += 1;
      cache.clear();
    },
    snapshot() {
      const out: PersistedHelpSpec[] = [];
      for (const [id, entry] of cache) {
        const spec = entry.spec;
        if (!spec || !isHelpSpecCommand(spec.command)) continue;
        const suffix = `:${spec.command}`;
        if (!id.endsWith(suffix)) continue;
        out.push({
          key: id.slice(0, -suffix.length),
          command: spec.command,
          flags: spec.flags,
          at: entry.at,
        });
      }
      return out.sort((a, b) => b.at - a.at);
    },
    seed(specs) {
      if (!Array.isArray(specs)) return;
      for (const item of specs) {
        if (!item || !isHelpSpecCommand(item.command)) continue;
        if (!Array.isArray(item.flags) || !item.flags.length) continue;
        const key = typeof item.key === "string" ? item.key.slice(0, HELP_SPEC_SCOPE_MAX_LENGTH) : "";
        const at = typeof item.at === "number" && Number.isFinite(item.at) ? item.at : now();
        if (at < 0 || now() - at >= ttlMs) continue;
        const id = cacheKey(key, item.command);
        if (cache.has(id)) continue;
        cache.set(id, { at, spec: { command: item.command, flags: item.flags, at } });
      }
      evictOldest();
    },
    get size() {
      return cache.size;
    },
    get inFlight() {
      return pending.size;
    },
  };
}
