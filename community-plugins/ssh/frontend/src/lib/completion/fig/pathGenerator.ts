// Remote-path generator for Fig Wave 2: when the current token looks like a
// path (or the command commonly takes one), list the remote directory via
// sftp/list and return file/directory CompletionItems.

import { splitCommandLine } from "../core/tokenize";
import type { CompletionItem } from "../core/types";
import type { FigGeneratorSlot } from "./generatorScheduler";
import type { FigSourceRequest, FigSpecManifest } from "./source";
import { isPendingPathOptionArg } from "./staticSpecSource";
import { findPendingOptionArg, pendingValueReplaceRange, type FigNamedLike } from "./optionArgPhase";

const PATH_COMMANDS = new Set([
  "cd", "ls", "ll", "cat", "less", "more", "head", "tail", "rm", "cp", "mv",
  "scp", "rsync", "tar", "unzip", "vim", "vi", "nano", "chmod", "chown", "touch",
  "mkdir", "stat", "file", "find", "ln", "tee", "du", "pushd", "popd", "source",
  "install", "diff", "patch",
]);

/** In-memory TTL cache for remote directory listings (keyed by session+path). */
const DIR_LIST_TTL_MS = 8_000;
const DIR_LIST_CACHE_MAX = 64;
type DirCacheEntry = { at: number; entries: PathListEntry[] };
const dirListCache = new Map<string, DirCacheEntry>();

export type PathListEntry = { name: string; kind?: string };

export type PathGeneratorPayload = {
  dir: string;
  /** Basename filter only (e.g. `log` from `data/log`). */
  prefix: string;
  /**
   * Directory portion of the typed path token as the user wrote it
   * (e.g. `data/` from `data/log`, `/var/` from `/var/lo`). Kept so accept
   * replaces the whole token without dropping `data/`.
   */
  tokenHead: string;
  replaceStart: number;
  replaceEnd: number;
  /** Optional session key so the cache can isolate hosts. */
  cacheKey?: string;
};

/** Keep `data/` / `/var/` / `~/bin/` when completing the final path segment. */
export function pathTokenHead(token: string): string {
  const slash = token.lastIndexOf("/");
  if (slash < 0) return "";
  return token.slice(0, slash + 1);
}

function lastTokenRange(line: string, trailingSpace: boolean): { start: number; end: number; prefix: string } {
  if (trailingSpace) return { start: line.length, end: line.length, prefix: "" };
  const match = /\S+$/.exec(line);
  if (!match) return { start: line.length, end: line.length, prefix: "" };
  return { start: match.index, end: line.length, prefix: match[0] };
}

function looksLikePath(token: string): boolean {
  if (!token) return false;
  if (token.startsWith("-") && token !== "-") return false;
  return token.includes("/") || token.startsWith("~") || token.startsWith(".") || token === "-";
}

function joinRemote(dir: string, name: string): string {
  if (dir === "/") return `/${name}`;
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

function parentDir(dir: string): string | null {
  if (!dir || dir === "/") return null;
  const trimmed = dir.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash <= 0) return "/";
  return trimmed.slice(0, slash) || "/";
}

/** Expand `~` / `~/` / `~user` for remote listing (home user → `/home/<user>`). */
export function expandTildePath(token: string): string {
  if (token === "~") return "~";
  // Keep prior Wave-1 behavior: `~/foo` → `/foo` (absolute from `/`).
  if (token.startsWith("~/")) return token.slice(1);
  const m = /^~([A-Za-z_][A-Za-z0-9_-]*)(\/.*)?$/.exec(token);
  if (m) return `/home/${m[1]}${m[2] ?? ""}`;
  return token;
}

/** Split a typed path token into directory to list + name prefix. */
export function splitPathToken(token: string, cwd: string): { dir: string; prefix: string } {
  const raw = token === "-" ? "" : token;
  if (raw === "~") return { dir: "/home", prefix: "" };
  const expanded = expandTildePath(raw);
  const absolute = expanded.startsWith("/");
  const relativeBase = cwd && cwd !== "/" ? cwd.replace(/\/+$/, "") : "/";
  if (!expanded) return { dir: relativeBase || "/", prefix: "" };
  const slash = expanded.lastIndexOf("/");
  if (slash < 0) return { dir: relativeBase || "/", prefix: expanded };
  const head = expanded.slice(0, slash) || "/";
  const prefix = expanded.slice(slash + 1);
  const dir = absolute
    ? (head.startsWith("/") ? head : `/${head}`)
    : joinRemote(relativeBase || "/", head.replace(/^\.\//, ""));
  return { dir, prefix };
}

/**
 * Prefer the terminal's OSC 7 / OSC 633 cwd for path completion; fall back to
 * a non-root SFTP panel path when shell-integration has not reported a directory.
 *
 * Returns "" when cwd is unknown. Callers must not invent `/` for relative
 * tokens — that wrongly surfaces root entries like `bin`/`boot` after `cd`.
 * SFTP `/` alone is treated as unknown (panel default, not shell cwd).
 */
export function resolvePathCompletionCwd(terminalCwd: string, sftpPath: string): string {
  const fromTerminal = (terminalCwd || "").trim();
  if (fromTerminal) return fromTerminal.startsWith("/") ? fromTerminal : `/${fromTerminal}`;
  const fromSftp = (sftpPath || "").trim();
  if (!fromSftp || fromSftp === "/") return "";
  return fromSftp.startsWith("/") ? fromSftp : `/${fromSftp}`;
}

/**
 * Best-effort cwd from a classic user@host:/path# prompt when OSC cwd is missing.
 * Example: `root@k8s-121:/data/logs/bi-apigw# tail -200f b` → `/data/logs/bi-apigw`.
 */
export function cwdFromShellPrompt(textBeforeCursor: string): string {
  const line = textBeforeCursor.replace(/\r/g, "");
  // Take the segment after the last newline (current prompt line).
  const current = line.includes("\n") ? line.slice(line.lastIndexOf("\n") + 1) : line;
  // user@host:/path# cmd  |  /path$ cmd
  const match = /:(\/[^#$>%\s]+)\s*[#$>%](?:\s+|$)/.exec(current)
    || /^(\/[^#$>%\s]+)\s*[#$>%](?:\s+|$)/.exec(current);
  const raw = (match?.[1] || "").trim();
  if (!raw.startsWith("/")) return "";
  return raw.replace(/\/+$/, "") || "/";
}

/** True when the path token can be resolved without a known shell cwd. */
export function pathTokenNeedsCwd(token: string): boolean {
  if (!token || token === "-") return true; // bare / trailing → list cwd
  if (token.startsWith("/") || token.startsWith("~")) return false;
  return true;
}

function resolvePathTokenForSlots(
  line: string,
  cwd: string,
  manifest?: FigSpecManifest,
): { dir: string; prefix: string; tokenHead: string; replaceStart: number; replaceEnd: number } | null {
  const { tokens, trailingSpace } = splitCommandLine(line);
  if (!tokens.length) return null;
  const command = tokens[0]?.text ?? "";
  const tokenTexts = tokens.map((t) => t.text);

  // Option-arg value (including `--opt=val` / `-ofile`): edit the value span only.
  if (manifest) {
    const root = manifest[command] as FigNamedLike | undefined;
    if (root) {
      const pending = findPendingOptionArg(root, tokenTexts, trailingSpace);
      if (pending) {
        const range = pendingValueReplaceRange(line.replace(/^\s+/, ""), trailingSpace, pending);
        const lead = (/^\s*/.exec(line)?.[0].length) ?? 0;
        const { dir, prefix } = splitPathToken(range.prefix, cwd || "/");
        return {
          dir,
          prefix,
          tokenHead: pathTokenHead(range.prefix),
          replaceStart: range.start + lead,
          replaceEnd: range.end + lead,
        };
      }
    }
  }

  const range = lastTokenRange(line, trailingSpace);
  const { dir, prefix } = splitPathToken(range.prefix, cwd || "/");
  return {
    dir,
    prefix,
    tokenHead: pathTokenHead(range.prefix),
    replaceStart: range.start,
    replaceEnd: range.end,
  };
}

/**
 * Open a path slot only when:
 * - command is a known path consumer (cd/ls/…), or
 * - the token looks like a path (~/ ./ /), or
 * - Fig says we are filling a file-like option arg (--cert / -K / …).
 * Never fire on bare trailing space for unrelated commands (e.g. `curl --get `).
 */
export function pathCompletionSlots(
  request: FigSourceRequest,
  cwd: string,
  manifest?: FigSpecManifest,
): FigGeneratorSlot[] {
  const line = request.line ?? "";
  const { tokens, trailingSpace } = splitCommandLine(line);
  if (!tokens.length) return [];
  const command = tokens[0]?.text ?? "";
  const range = lastTokenRange(line, trailingSpace);
  let prefixToken = range.prefix;
  // For `--opt=val` / `-ofile`, the token starts with `-` but the value may be a path.
  const pendingPathArg = manifest ? isPendingPathOptionArg(line, manifest) : false;
  if (prefixToken.startsWith("-") && prefixToken !== "-" && !pendingPathArg) return [];
  if (pendingPathArg && prefixToken.includes("=")) {
    prefixToken = prefixToken.slice(prefixToken.indexOf("=") + 1);
  } else if (pendingPathArg && /^-[^-].+/.test(prefixToken) && !prefixToken.startsWith("--")) {
    prefixToken = prefixToken.slice(2);
  }
  const commandWantsPath = PATH_COMMANDS.has(command);
  const pathShaped = looksLikePath(prefixToken) || (pendingPathArg && (trailingSpace || Boolean(prefixToken)));
  // Path commands: after space list cwd; otherwise require path-shaped / pending file arg.
  if (commandWantsPath) {
    if (!trailingSpace && !pathShaped && tokens.length < 2 && !pendingPathArg) return [];
  } else if (!pathShaped && !pendingPathArg) {
    return [];
  }

  const effectiveCwd = (cwd || "").trim();
  // Relative tokens (`b`, `data/log`, trailing space on `tail `) need a real
  // shell/SFTP cwd. Without one, listing `/` invents root hits like bin/boot.
  const pathValue = trailingSpace && !prefixToken ? "" : prefixToken;
  if (pathTokenNeedsCwd(pathValue) && !effectiveCwd) return [];

  const resolved = resolvePathTokenForSlots(line, effectiveCwd || "/", manifest);
  if (!resolved) return [];
  // No basename fragment yet (`cd `, `cd /`, `ls data/`) → do not open the
  // menu; listing every entry on empty input is noise. Wait until the user
  // types at least one character of the leaf name.
  if (!resolved.prefix) return [];
  const payload: PathGeneratorPayload = {
    dir: resolved.dir,
    prefix: resolved.prefix,
    tokenHead: resolved.tokenHead,
    replaceStart: resolved.replaceStart,
    replaceEnd: resolved.replaceEnd,
    cacheKey: request.sessionId,
  };
  return [{
    command,
    commandPath: [command],
    tokenStart: resolved.replaceStart,
    tokenEnd: resolved.replaceEnd,
    payload,
  }];
}

/**
 * Path basename match: prefix wins; otherwise a strict segment-aware
 * subsequence (`bid` → `bi-datax-import`). Empty query never matches.
 *
 * Fuzzy gaps are only allowed at `-` / `_` / `.` word starts — never inside
 * a run of letters — so `dat` / `l` cannot invent a hit on `Default` while
 * the user is already under `/data/…`.
 */
export function scorePathName(query: string, name: string): number | null {
  if (!query) return null;
  const needle = query.toLowerCase();
  const haystack = name.toLowerCase();
  if (haystack === needle) return 120;
  if (haystack.startsWith(needle)) return 100 - Math.min(40, name.length);
  // Short queries stay prefix-only (`da` / `l` must not fuzzy-hit unrelated names).
  if (needle.length <= 2) return null;
  let score = 0;
  let cursor = 0;
  let prev = -1;
  for (let i = 0; i < needle.length; i += 1) {
    const ch = needle.charAt(i);
    const found = haystack.indexOf(ch, cursor);
    if (found === -1) return null;
    const atWordStart = found === 0 || /[-_.]/.test(name.charAt(found - 1));
    if (prev >= 0) {
      const gap = found - prev - 1;
      if (gap === 0) {
        score += 8;
      } else if (atWordStart) {
        // Skip a hyphenated / dotted segment (`bi` + `-` + `d…`).
        score += 4;
      } else {
        // Gap inside a letter run (`d…a…t` in Default) — reject.
        return null;
      }
    }
    if (atWordStart) score += 12;
    score += 1;
    prev = found;
    cursor = found + 1;
  }
  score += Math.max(0, 24 - Math.min(24, name.length));
  return score >= 8 ? score : null;
}

export function itemsFromListing(
  entries: PathListEntry[],
  payload: PathGeneratorPayload,
): CompletionItem[] {
  const needle = payload.prefix;
  const items: CompletionItem[] = [];
  for (const entry of entries) {
    if (!entry?.name || entry.name === "." || entry.name === "..") continue;
    const matchScore = scorePathName(needle, entry.name);
    if (matchScore == null) continue;
    const isDir = entry.kind === "directory";
    // Preserve typed path head (`data/` + `logs` → `data/logs/`), not just the basename filter.
    const insert = `${payload.tokenHead}${entry.name}${isDir ? "/" : ""}`;
    items.push({
      id: `path:${entry.name}`,
      label: entry.name,
      description: isDir ? "dir" : "file",
      kind: isDir ? "directory" : "file",
      score: matchScore,
      source: "path-gen",
      edit: { text: insert, replaceStart: payload.replaceStart, replaceEnd: payload.replaceEnd },
    });
  }
  return items
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 40);
}

function cacheGet(key: string): PathListEntry[] | null {
  const hit = dirListCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > DIR_LIST_TTL_MS) {
    dirListCache.delete(key);
    return null;
  }
  return hit.entries;
}

function cacheSet(key: string, entries: PathListEntry[]): void {
  if (dirListCache.size >= DIR_LIST_CACHE_MAX) {
    const oldest = dirListCache.keys().next().value;
    if (oldest != null) dirListCache.delete(oldest);
  }
  dirListCache.set(key, { at: Date.now(), entries });
}

/** Test helper: clear the directory listing TTL cache. */
export function clearPathDirCache(): void {
  dirListCache.clear();
}

export async function runPathCompletion(
  slot: FigGeneratorSlot,
  listDir: (path: string) => Promise<PathListEntry[] | null>,
): Promise<CompletionItem[] | null> {
  const payload = slot.payload as PathGeneratorPayload | undefined;
  if (!payload?.dir) return null;
  const cacheKey = `${payload.cacheKey ?? ""}:${payload.dir}`;
  try {
    let entries = cacheGet(cacheKey);
    if (!entries) {
      const listed = await listDir(payload.dir);
      if (listed) {
        cacheSet(cacheKey, listed);
        entries = listed;
      } else {
        // Dir list failed. Only recover when the user is still typing the
        // directory's own name (no child leaf yet). Once they have typed
        // `/data/l`, never substitute root entries like `Default` — that
        // looked like a real hit under `/data` and was pure noise.
        if (payload.prefix) return null;
        const parent = parentDir(payload.dir);
        if (!parent) return null;
        const parentKey = `${payload.cacheKey ?? ""}:${parent}`;
        let parentEntries = cacheGet(parentKey);
        if (!parentEntries) {
          const listedParent = await listDir(parent);
          if (!listedParent) return null;
          cacheSet(parentKey, listedParent);
          parentEntries = listedParent;
        }
        const leaf = payload.dir.slice(parent === "/" ? 1 : parent.length + 1);
        if (!leaf) return null;
        const fallbackPayload: PathGeneratorPayload = {
          ...payload,
          dir: parent,
          prefix: leaf,
          tokenHead: parent === "/" ? "/" : `${parent}/`,
        };
        const items = itemsFromListing(parentEntries, fallbackPayload);
        return items.length ? items : null;
      }
    }
    const items = itemsFromListing(entries, payload);
    return items.length ? items : null;
  } catch {
    return null;
  }
}
