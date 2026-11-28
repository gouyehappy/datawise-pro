/**
 * A conservative, read-only health check for the in-progress PTY input line
 * (beta.44). It never rewrites bytes and never blocks Enter: it only surfaces
 * a short "line check" hint for mistakes that would otherwise be discovered
 * *after* hitting Enter (a continuation prompt, or a shell that cannot parse
 * a smart quote produced by an IME).
 *
 * Design constraints (same family as `argumentHint.ts`):
 *  - Pure: no IPC, no timers, no host APIs, no key handlers. The caller owns
 *    the shadow input line and decides when to show the hint.
 *  - Fail silent: ambiguous input (heredoc, control chars, very long lines,
 *    a quote that was just opened with no content yet) returns no issues
 *    rather than a confidently wrong diagnosis.
 *  - Bounded: 4 KiB line, at most 3 issues, short built-in messages.
 *  - Columns use a wcwidth-like approximation, so a full-width CJK glyph
 *    before the error does not shift the reported column.
 */

export type ShellLineLocale = "en" | "zh-CN";

export type ShellLineIssueKind =
  | "smart-quote"
  | "unclosed-quote"
  | "unclosed-substitution"
  | "unclosed-parenthesis"
  | "dangling-operator";

export interface ShellLineIssue {
  kind: ShellLineIssueKind;
  /** 1-based *display* column of the offending character. */
  column: number;
  severity: "error" | "notice";
  message: string;
}

export const SHELL_LINT_MAX_LINE = 4096;
export const SHELL_LINT_MAX_ISSUES = 3;

const SMART_QUOTES = new Set(["\u201c", "\u201d", "\u2018", "\u2019"]);

/* ------------------------------------------------------------------ *
 * Display width (wcwidth approximation, no external dependency)
 * ------------------------------------------------------------------ */

function isCombining(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  );
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200b || cp === 0x200c || cp === 0x200d ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    cp === 0xfeff
  );
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2329 && cp <= 0x232a) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x3100 && cp <= 0x312f) ||
    (cp >= 0x3190 && cp <= 0x31ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function codePointColumns(cp: number): number {
  if (cp === 0 || cp === 0x200d) return 0;
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return 0;
  if (isCombining(cp) || isZeroWidth(cp)) return 0;
  return isWide(cp) ? 2 : 1;
}

/** Display width of the first `limit` code points (default: all of them). */
export function displayColumnWidth(text: string, limit = Number.POSITIVE_INFINITY): number {
  if (typeof text !== "string" || !text) return 0;
  let width = 0;
  let index = 0;
  for (const ch of text) {
    if (index >= limit) break;
    width += codePointColumns(ch.codePointAt(0) ?? 0);
    index += 1;
  }
  return width;
}

/** Column of a code-point index, 1-based. */
function columnAt(chars: readonly string[], at: number): number {
  return displayColumnWidth(chars.slice(0, at).join("")) + 1;
}

/* ------------------------------------------------------------------ *
 * Messages (built in, like argumentHint.ts — no i18n table dependency)
 * ------------------------------------------------------------------ */

function lintMessage(
  kind: ShellLineIssueKind,
  token: string,
  locale: ShellLineLocale,
  count: number,
): string {
  const zh = locale === "zh-CN";
  switch (kind) {
    case "smart-quote":
      return zh
        ? `检测到 ${count} 个智能引号，请改用 ASCII 的 ' 或 "`
        : `Smart quotes (${count}) detected — use ASCII ' or "`;
    case "unclosed-quote":
      return zh
        ? `${token} 未闭合，回车会进入续行提示`
        : `Unclosed ${token} — Enter opens a continuation prompt`;
    case "unclosed-substitution":
      return zh ? `${token} 未闭合，请先补全再执行` : `Unclosed ${token} — complete it before running`;
    case "unclosed-parenthesis":
      return zh ? `( 未闭合，请先补全再执行` : `Unclosed ( — complete it before running`;
    case "dangling-operator":
      return zh ? `${token} 后面还缺一条命令` : `${token} needs a following command`;
  }
}

/* ------------------------------------------------------------------ *
 * The scan
 * ------------------------------------------------------------------ */

type OpenerKind = "single" | "double" | "subst" | "brace" | "paren" | "backtick";
type Opener = { kind: OpenerKind; token: string; at: number };

/**
 * Diagnose a single in-progress shell line. Returns at most
 * `SHELL_LINT_MAX_ISSUES` issues, sorted with deterministic errors first.
 */
export function lintShellLine(line: string, locale: ShellLineLocale = "en"): ShellLineIssue[] {
  if (typeof line !== "string" || !line || line.length > SHELL_LINT_MAX_LINE) return [];
  // C0 (except TAB), DEL and replacement chars: the shadow line should never
  // contain them, so stay silent rather than diagnose a corrupted buffer.
  if (/[\u0000-\u0008\u000a-\u001f\u007f\ufffd]/.test(line)) return [];
  // Heredocs span multiple lines; a single line is not enough to judge.
  if (line.includes("<<")) return [];

  const chars = Array.from(line);
  const stack: Opener[] = [];
  const smartQuotes: number[] = [];
  let escaped = false;
  let atTokenStart = true;
  let comment = false;

  for (let i = 0; i < chars.length; i += 1) {
    if (comment) break;
    const ch = chars[i];
    const top = stack[stack.length - 1];
    const inSingle = top?.kind === "single";
    const inDouble = top?.kind === "double";

    if (escaped) {
      escaped = false;
      atTokenStart = false;
      continue;
    }
    // Backslash is literal inside single quotes; elsewhere it escapes the next
    // character (including a quote, a pipe or another backslash).
    if (ch === "\\" && !inSingle) {
      escaped = true;
      atTokenStart = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'") stack.pop();
      continue;
    }

    // Curly quotes are only a *syntax* error outside ASCII quotes. Inside a
    // double-quoted string they are perfectly valid content.
    if (SMART_QUOTES.has(ch) && !inDouble) {
      smartQuotes.push(i);
      atTokenStart = false;
      continue;
    }
    if (ch === "'") {
      stack.push({ kind: "single", token: "'", at: i });
      atTokenStart = false;
      continue;
    }
    if (ch === '"') {
      if (inDouble) stack.pop();
      else stack.push({ kind: "double", token: '"', at: i });
      atTokenStart = false;
      continue;
    }
    // A `#` only starts a comment at the beginning of a word.
    if (ch === "#" && atTokenStart) {
      comment = true;
      continue;
    }
    if (ch === "$" && chars[i + 1] === "(") {
      stack.push({ kind: "subst", token: "$(", at: i });
      i += 1;
      atTokenStart = false;
      continue;
    }
    if (ch === "$" && chars[i + 1] === "{") {
      stack.push({ kind: "brace", token: "${", at: i });
      i += 1;
      atTokenStart = false;
      continue;
    }
    if (ch === "`") {
      if (top?.kind === "backtick") stack.pop();
      else stack.push({ kind: "backtick", token: "`", at: i });
      atTokenStart = false;
      continue;
    }
    if (ch === "(") {
      stack.push({ kind: "paren", token: "(", at: i });
      atTokenStart = false;
      continue;
    }
    if (ch === ")") {
      if (top?.kind === "subst" || top?.kind === "paren") stack.pop();
      atTokenStart = false;
      continue;
    }
    if (ch === "}") {
      if (top?.kind === "brace") stack.pop();
      atTokenStart = false;
      continue;
    }
    atTokenStart = ch === " " || ch === "\t" || ch === "|" || ch === "&" || ch === ";";
  }

  const issues: ShellLineIssue[] = [];

  // 1) Deterministic error: IME smart quotes outside ASCII quotes.
  if (smartQuotes.length) {
    issues.push({
      kind: "smart-quote",
      column: columnAt(chars, smartQuotes[0]),
      severity: "error",
      message: lintMessage("smart-quote", "", locale, smartQuotes.length),
    });
  }

  // 2) Unclosed opener. Report the *outermost* one only, and only when there
  //    is real content after it — a quote that was just opened is the normal
  //    state while typing, not a mistake worth a hint.
  if (stack.length) {
    const opener = stack[0];
    const body = chars.slice(opener.at + opener.token.length);
    if (body.some((c) => c !== " " && c !== "\t")) {
      const kind: ShellLineIssueKind =
        opener.kind === "single" || opener.kind === "double"
          ? "unclosed-quote"
          : opener.kind === "paren"
            ? "unclosed-parenthesis"
            : "unclosed-substitution";
      issues.push({
        kind,
        column: columnAt(chars, opener.at),
        severity: "notice",
        message: lintMessage(kind, opener.token, locale, 0),
      });
    }
  } else {
    // 3) Only when everything is balanced: a trailing pipe / logical AND / OR
    //    means Enter would open a continuation prompt. A single `&` (background
    //    job) and `;` (statement terminator) are both valid, so never flag them.
    let tail = chars.length;
    while (tail > 0 && (chars[tail - 1] === " " || chars[tail - 1] === "\t")) tail -= 1;
    const last = chars[tail - 1];
    if (last === "|" || last === "&") {
      let opAt = tail - 1;
      let token = last;
      if (opAt > 0 && chars[opAt - 1] === last) {
        token = last + last;
        opAt -= 1;
      }
      const escapedOp = opAt > 0 && chars[opAt - 1] === "\\";
      const hasLeft = chars.slice(0, opAt).some((c) => c !== " " && c !== "\t");
      if (!escapedOp && token !== "&" && hasLeft) {
        issues.push({
          kind: "dangling-operator",
          column: columnAt(chars, opAt),
          severity: "notice",
          message: lintMessage("dangling-operator", token, locale, 0),
        });
      }
    }
  }

  return issues
    .sort((a, b) =>
      a.severity === b.severity
        ? a.column - b.column
        : a.severity === "error" ? -1 : 1,
    )
    .slice(0, SHELL_LINT_MAX_ISSUES);
}
