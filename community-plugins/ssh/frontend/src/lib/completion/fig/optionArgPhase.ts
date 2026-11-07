/**
 * Detect when the cursor is filling an option's argument (e.g. `curl --cert ▌`,
 * `curl --cert ./fo▌`, `curl --config=./fo▌`, or `curl -Kfile▌`), so completers
 * can switch from flag listing to value mode.
 */

export interface FigNamedLike {
  name?: string | string[];
  description?: string;
  options?: FigNamedLike[];
  subcommands?: FigNamedLike[];
  args?: unknown;
  isRepeatable?: boolean;
}

export type PendingOptionArg = {
  option: FigNamedLike;
  /** How the value is attached to the flag token. */
  style: "separate" | "equals" | "attached";
  /** Value text currently being typed (empty when trailing space after flag). */
  valuePrefix: string;
};

function namesOf(entry: FigNamedLike | undefined): string[] {
  if (!entry?.name) return [];
  return Array.isArray(entry.name) ? entry.name.filter(Boolean) : [entry.name];
}

export function optionConsumesArg(option: FigNamedLike | undefined): boolean {
  return option?.args != null;
}

export function findOption(parent: FigNamedLike, token: string): FigNamedLike | null {
  const head = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
  const needle = head.toLowerCase();
  for (const opt of parent.options ?? []) {
    if (namesOf(opt).some((n) => n.toLowerCase() === needle)) return opt;
  }
  return null;
}

/**
 * Match a short option with an attached value (`-ofile`, `-Ecert`) or
 * `--long=value`. Returns the option + value prefix, or null.
 */
export function matchAttachedOptionArg(
  parent: FigNamedLike,
  token: string,
): { option: FigNamedLike; style: "equals" | "attached"; valuePrefix: string; flag: string } | null {
  if (!token.startsWith("-") || token === "-") return null;

  const eq = token.indexOf("=");
  if (eq > 0) {
    const flag = token.slice(0, eq);
    const opt = findOption(parent, flag);
    if (opt && optionConsumesArg(opt)) {
      return { option: opt, style: "equals", valuePrefix: token.slice(eq + 1), flag };
    }
    return null;
  }

  // Long flags without `=` are never attached (`--cert` needs a separate token).
  if (token.startsWith("--")) return null;

  // Short: try longest exact option name that is a prefix of the token (usually `-X`).
  let best: { option: FigNamedLike; flag: string } | null = null;
  for (const opt of parent.options ?? []) {
    if (!optionConsumesArg(opt)) continue;
    for (const name of namesOf(opt)) {
      if (!/^-[^-]$/.test(name)) continue;
      if (!token.toLowerCase().startsWith(name.toLowerCase())) continue;
      if (token.length <= name.length) continue;
      if (!best || name.length > best.flag.length) best = { option: opt, flag: name };
    }
  }
  if (!best) return null;
  return {
    option: best.option,
    style: "attached",
    valuePrefix: token.slice(best.flag.length),
    flag: best.flag,
  };
}

function findSubcommand(parent: FigNamedLike, token: string): FigNamedLike | null {
  const needle = token.toLowerCase();
  for (const sub of parent.subcommands ?? []) {
    if (namesOf(sub).some((n) => n.toLowerCase() === needle)) return sub;
  }
  return null;
}

/** Walk completed tokens to the active subcommand context. */
export function walkSpecContext(root: FigNamedLike, tokens: string[], trailingSpace: boolean): FigNamedLike {
  let current: FigNamedLike = root;
  const limit = trailingSpace ? tokens.length : Math.max(0, tokens.length - 1);
  let i = 1;
  while (i < limit) {
    const token = tokens[i];
    if (!token) break;
    if (token.startsWith("-") && token !== "-") {
      if (token.includes("=")) {
        i += 1;
        continue;
      }
      const attached = matchAttachedOptionArg(current, token);
      if (attached) {
        i += 1;
        continue;
      }
      const opt = findOption(current, token);
      if (opt && optionConsumesArg(opt) && i + 1 < limit && !tokens[i + 1]?.startsWith("-")) {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    const sub = findSubcommand(current, token);
    if (!sub) break;
    current = sub;
    i += 1;
  }
  return current;
}

/**
 * True when `args` looks like a filesystem value (filepaths template or file-like name).
 */
export function argWantsPath(args: unknown): boolean {
  if (!args || typeof args !== "object") return false;
  const a = args as Record<string, unknown>;
  const template = a.template;
  if (template === "filepaths" || template === "folders" || template === "filepaths + folders") return true;
  if (Array.isArray(template) && template.some((t) => String(t).includes("filepath") || String(t).includes("folder"))) {
    return true;
  }
  const name = String(a.name ?? "").toLowerCase();
  return /^(file|path|dir|directory|folder|certificate|cert|key|filename|pem|crt)\b/.test(name)
    || name.includes("file")
    || name.includes("path")
    || name.includes("certificate");
}

export function argDisplayName(args: unknown): string {
  if (Array.isArray(args)) return argDisplayName(args[0]);
  if (!args || typeof args !== "object") return "value";
  const name = String((args as { name?: unknown }).name ?? "").trim();
  return name || "value";
}

/** Static suggestion strings declared on a Fig args object (or first match in an args array). */
export function argSuggestionList(args: unknown): string[] {
  if (Array.isArray(args)) {
    for (const entry of args) {
      const list = argSuggestionList(entry);
      if (list.length) return list;
    }
    return [];
  }
  if (!args || typeof args !== "object") return [];
  const raw = (args as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && entry.trim()) {
      out.push(entry.trim());
      continue;
    }
    if (entry && typeof entry === "object") {
      const name = String((entry as { name?: unknown }).name ?? "").trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/**
 * Pick the active positional args entry when `args` is an array
 * (`chmod 755 ▌` → file template; `chmod ▌` → mode suggestions).
 */
export function activePositionalArgs(
  args: unknown,
  tokens: string[],
  trailingSpace: boolean,
): unknown {
  if (!Array.isArray(args) || !args.length) return args;
  let completed = 0;
  const end = trailingSpace ? tokens.length : Math.max(1, tokens.length - 1);
  for (let i = 1; i < end; i += 1) {
    const token = tokens[i];
    if (!token || (token.startsWith("-") && token !== "-")) continue;
    completed += 1;
  }
  const index = trailingSpace ? completed : Math.max(0, completed);
  return args[Math.min(index, args.length - 1)] ?? args[0];
}

/**
 * Option whose argument the cursor is currently editing, or null for normal
 * flag/subcommand listing.
 */
export function findPendingOptionArg(
  root: FigNamedLike,
  tokens: string[],
  trailingSpace: boolean,
): PendingOptionArg | null {
  if (tokens.length < 2) return null;
  const current = walkSpecContext(root, tokens, trailingSpace);

  if (trailingSpace) {
    const last = tokens[tokens.length - 1];
    if (!last || !last.startsWith("-") || last === "-") return null;
    if (last.includes("=")) return null;
    if (matchAttachedOptionArg(current, last)) return null;
    const opt = findOption(current, last);
    return opt && optionConsumesArg(opt)
      ? { option: opt, style: "separate", valuePrefix: "" }
      : null;
  }

  const cur = tokens[tokens.length - 1];
  if (!cur) return null;

  // `--opt=value` or `-ofile` on the current token.
  if (cur.startsWith("-") && cur !== "-") {
    const parent = walkSpecContext(root, tokens, false);
    const attached = matchAttachedOptionArg(parent, cur);
    if (attached) {
      return {
        option: attached.option,
        style: attached.style,
        valuePrefix: attached.valuePrefix,
      };
    }
    return null;
  }

  // Separate value token: previous must be an option that consumes an arg.
  if (tokens.length < 3) return null;
  const prev = tokens[tokens.length - 2];
  if (!prev?.startsWith("-") || prev === "-" || prev.includes("=")) return null;
  if (matchAttachedOptionArg(walkSpecContext(root, tokens, false), prev)) return null;
  const parent = walkSpecContext(root, tokens, false);
  const opt = findOption(parent, prev);
  return opt && optionConsumesArg(opt)
    ? { option: opt, style: "separate", valuePrefix: cur }
    : null;
}

/** Absolute [start,end) of the value being edited within `line` (trimmed lead already removed from tokens). */
export function pendingValueReplaceRange(
  line: string,
  trailingSpace: boolean,
  pending: PendingOptionArg,
): { start: number; end: number; prefix: string } {
  const end = line.length;
  if (trailingSpace || pending.style === "separate" && !pending.valuePrefix) {
    return { start: end, end, prefix: "" };
  }
  if (pending.style === "equals") {
    const eq = line.lastIndexOf("=");
    if (eq >= 0) return { start: eq + 1, end, prefix: line.slice(eq + 1) };
  }
  if (pending.style === "attached") {
    // Value begins after the short flag (`-o` → index of first value char).
    const match = /-\S+$/.exec(line);
    if (match) {
      const tokenStart = match.index;
      const valueStart = tokenStart + 2; // `-X`
      return { start: valueStart, end, prefix: line.slice(valueStart) };
    }
  }
  // Separate value token: replace the last \S+ run.
  const match = /\S+$/.exec(line);
  if (!match) return { start: end, end, prefix: "" };
  return { start: match.index, end, prefix: match[0] };
}

export function hasFigCommandSpec(command: string, manifest: Readonly<Record<string, unknown>>): boolean {
  const key = command.trim();
  if (!key) return false;
  const spec = manifest[key];
  return Boolean(spec && typeof spec === "object");
}

/**
 * Soft history under Fig should stay hidden when Fig is about to list
 * flags/subs/option values — avoids the 50ms-history / 90ms-Fig flash.
 */
export function shouldSuppressSoftHistoryUnderFig(
  typedLine: string,
  manifest: Readonly<Record<string, unknown>>,
): boolean {
  try {
    const trimmed = typedLine.replace(/^\s+/, "");
    if (!trimmed) return false;
    const command = trimmed.split(/\s+/)[0] ?? "";
    if (!hasFigCommandSpec(command, manifest)) return false;
    if (findPendingOptionArg(
      manifest[command] as FigNamedLike,
      trimmed.trimEnd().split(/\s+/).filter(Boolean),
      /\s$/.test(trimmed),
    )) return true;
    // Trailing space → Fig lists flags/subs; flag prefix → Fig filters options.
    if (/\s$/.test(trimmed)) return true;
    const last = trimmed.split(/\s+/).pop() ?? "";
    if (last.startsWith("-")) return true;
    return false;
  } catch {
    return false;
  }
}
