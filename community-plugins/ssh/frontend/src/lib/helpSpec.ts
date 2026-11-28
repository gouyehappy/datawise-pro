/**
 * Remote `--help` → argument spec (beta.43).
 *
 * The curated specs in `argumentHint.ts` cover 27 common commands. For every
 * other command the overlay can now offer *user-initiated* discovery by running
 * `<command> --help` on the remote host and parsing the option lines.
 *
 * Safety contract (deliberately stricter than a normal completion generator):
 *  - **Never interpolate user input.** Only a validated bare command name is
 *    used; the executed string is always exactly `<command> --help`.
 *  - **Explicit trigger only.** The UI shows a button; nothing runs on keypress,
 *    on focus, or on a timer. Zero automatic IPC while the user types.
 *  - **Command allowlist shape + denylist.** No shell metacharacters, no path
 *    separators, no leading dash; state-changing / interactive / destructive
 *    names are refused even though `--help` normally short-circuits them —
 *    some programs ignore unknown options and fall through to their default
 *    action, and some shells would open an interactive REPL.
 *  - **Bounded.** Exec: `sudo:false`, `timeoutSecs:5` (the backend's own floor;
 *    smaller values are clamped) plus a 9s frontend RPC timeout. Parse:
 *    400 lines / 512 chars per line / 40 flags / 120-char descriptions.
 *  - **Fail closed.** Any error, empty output or unparseable text yields no
 *    hints; the input path is never blocked and not a single byte is rewritten.
 *  - Read-only *connections* are allowed: `--help` is a read operation, and the
 *    backend only rejects `ssh/exec` when `sudo` is requested. Sudo is never
 *    requested here.
 */

import type { ArgumentFlagHint } from "./argumentHint";

export const HELP_SPEC_COMMAND_MAX_LENGTH = 48;
export const HELP_SPEC_MAX_LINES = 400;
export const HELP_SPEC_MAX_LINE_CHARS = 512;
export const HELP_SPEC_MAX_FLAGS = 40;
export const HELP_SPEC_MAX_DESCRIPTION = 120;
export const HELP_SPEC_MAX_FLAG_CHARS = 64;
/** Sidecar-side exec timeout (seconds); `ssh/exec` clamps to a 5s floor. */
export const HELP_SPEC_TIMEOUT_SECS = 5;
/** Frontend RPC timeout (ms) — must exceed the sidecar timeout + overhead. */
export const HELP_SPEC_INVOKE_TIMEOUT_MS = 9_000;

/** Bare command name: no slashes, spaces, shell metacharacters or leading dash. */
const COMMAND_PATTERN = /^[A-Za-z][A-Za-z0-9._+-]*$/;

/**
 * Commands whose `--help` is not worth the risk: destructive / state-changing,
 * shells that may open an interactive REPL, pagers, and anything that can hang
 * or mutate state if the program ignores the option. Timeout is a backstop,
 * not a substitute for refusing these outright.
 */
const BLOCKED_COMMANDS: ReadonlySet<string> = new Set([
  // destructive / filesystem state
  "rm", "rmdir", "dd", "truncate", "fallocate", "shred", "wipefs", "fdisk",
  "parted", "mkswap", "swapoff", "swapon", "mount", "umount", "fsck", "e2fsck",
  "mkfs", "chmod", "chown", "chgrp", "setfacl", "chattr", "lsattr",
  // system / service / kernel state
  "shutdown", "reboot", "halt", "poweroff", "init", "systemctl", "service",
  "sysctl", "insmod", "rmmod", "modprobe", "iptables", "nft", "ip", "ifconfig",
  "route", "crontab", "at", "useradd", "userdel", "usermod", "groupadd",
  "groupdel", "passwd", "chpasswd", "visudo", "sudo", "su", "login",
  // process control
  "kill", "killall", "pkill", "skill", "renice", "nice",
  // shells / REPLs / editors / pagers (would hang or take over the channel)
  "sh", "bash", "zsh", "dash", "fish", "csh", "tcsh", "ksh", "eval", "exec",
  "source", "alias", "unalias", "export", "unset", "set", "read", "wait", "fg",
  "bg", "jobs", "history", "exit", "logout", "cd", "pushd", "popd", "test", "[",
  "vi", "vim", "nvim", "nano", "emacs", "less", "more", "man", "info", "top",
  "htop", "watch", "screen", "tmux", "mysql", "psql", "sqlite3", "redis-cli",
]);

/** Prefixes covering `mkfs.ext4`, `ip-link`-style variants, `git-*` helpers. */
const BLOCKED_PREFIXES: readonly string[] = ["mkfs.", "fsck.", "ip-", "git-"];

/** Validate a bare command name before it may ever reach `ssh/exec`. */
export function isHelpSpecCommand(command: unknown): command is string {
  if (typeof command !== "string") return false;
  if (!command || command.length > HELP_SPEC_COMMAND_MAX_LENGTH) return false;
  if (!COMMAND_PATTERN.test(command)) return false;
  // `..` is legal in a bare name but never a real executable; refuse it so a
  // creative host alias cannot turn into a path traversal.
  if (command.includes("..")) return false;
  const lower = command.toLowerCase();
  if (BLOCKED_COMMANDS.has(lower)) return false;
  for (const prefix of BLOCKED_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }
  return true;
}

/** The one and only command string we are willing to run for a remote spec. */
export function helpSpecCommand(command: string): string | null {
  return isHelpSpecCommand(command) ? `${command} --help` : null;
}

const ANSI_ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/** A single option token: `-a`, `--all`, `--output=FILE`, `-f <path>`. */
const OPTION_TOKEN = /^--?[A-Za-z0-9][A-Za-z0-9._-]*(?:=[A-Za-z0-9._-]+|<[^<>]{1,24}>)?$/;

function cleanDescription(raw: string): string {
  return raw
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HELP_SPEC_MAX_DESCRIPTION);
}

function canonicalFlag(label: string): string {
  const parts = label.split(/[\s,]+/).filter((part) => part.startsWith("-"));
  return parts.reduce((longest, part) => (part.length > longest.length ? part : longest), parts[0] ?? label);
}

/** Match a typed prefix against individual option tokens, not the whole label. */
function matchesPrefix(label: string, prefix: string): boolean {
  if (!prefix) return true;
  return label
    .split(/[\s,]+/)
    .filter((part) => part.startsWith("-"))
    .some((part) => part.startsWith(prefix));
}

/**
 * Parse GNU / argparse / cobra-style option lines into display hints.
 * Only indented lines that *start* with a dash are considered, so Usage,
 * Examples, section headers and prose never become fake flags. Everything is
 * bounded and deduplicated by the longest (usually `--long`) flag name.
 */
export function parseHelpFlags(text: string): ArgumentFlagHint[] {
  if (typeof text !== "string" || !text) return [];
  const lines = text.split(/\r?\n/).slice(0, HELP_SPEC_MAX_LINES);
  const out: ArgumentFlagHint[] = [];
  const seen = new Set<string>();
  for (const rawLine of lines) {
    if (rawLine.length > HELP_SPEC_MAX_LINE_CHARS) continue;
    const line = rawLine.replace(ANSI_ESCAPE, "").replace(CONTROL_CHARS, "");
    // Leading whitespace + dash (or a dash in column 0) marks an option row.
    // Strip the indent FIRST: it is itself 2+ spaces, and a naive column split
    // would otherwise consume the indent as the separator and drop every row.
    if (!/^\s*-/.test(line)) continue;
    const body = line.replace(/^\s+/, "");
    if (!body.startsWith("-")) continue;
    // Typical help output separates the option column from the description
    // column with 2+ spaces or a tab. Without a separator the whole (short)
    // line is treated as the option part and the description stays empty.
    const split = /^(.{1,160}?)(?: {2,}|\t+)(.*)$/.exec(body);
    const optionPart = (split ? split[1] : body).trim();
    if (!optionPart.startsWith("-")) continue;
    const description = split ? cleanDescription(split[2]) : "";
    const flags: string[] = [];
    for (const token of optionPart.split(/[\s,]+/).filter(Boolean)) {
      if (token.length <= HELP_SPEC_MAX_FLAG_CHARS && OPTION_TOKEN.test(token)) flags.push(token);
    }
    if (!flags.length) continue;
    const label = flags.join(", ");
    const key = canonicalFlag(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ flag: label, description });
    if (out.length >= HELP_SPEC_MAX_FLAGS) break;
  }
  return out;
}

/**
 * Curated static flags win over parsed remote ones (they are localized and
 * hand-checked). Optional token prefix narrows both sources; result is capped.
 */
export function mergeHelpFlags(
  staticFlags: readonly ArgumentFlagHint[],
  remoteFlags: readonly ArgumentFlagHint[],
  currentToken = "",
  max = HELP_SPEC_MAX_FLAGS,
): ArgumentFlagHint[] {
  const prefix = currentToken.startsWith("-") ? currentToken : "";
  const out: ArgumentFlagHint[] = [];
  const seen = new Set<string>();
  for (const flag of [...staticFlags, ...remoteFlags]) {
    if (!flag || typeof flag.flag !== "string" || !flag.flag) continue;
    const key = canonicalFlag(flag.flag);
    if (seen.has(key)) continue;
    seen.add(key);
    if (prefix && !matchesPrefix(flag.flag, prefix)) continue;
    out.push({
      flag: flag.flag.slice(0, HELP_SPEC_MAX_FLAG_CHARS * 2),
      description: String(flag.description ?? "").slice(0, HELP_SPEC_MAX_DESCRIPTION),
    });
    if (out.length >= Math.max(0, Math.floor(max))) break;
  }
  return out;
}
