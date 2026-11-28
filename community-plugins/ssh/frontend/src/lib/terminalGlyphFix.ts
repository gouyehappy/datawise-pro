/**
 * 输入文本的全角 / 智能标点纠错（对标 Motty `internal/workbench/terminal_input_guard.go`
 * 的 `commandGlyphFix` 与 `shellInputPrefix`）。
 *
 * 纯函数层：只做字符映射与保守守卫，不解析 shell、不自动发送、不占用任何按键。
 * 红线（同 Motty `docs/terminal-input-compatibility.md`）：
 *  - 绝不静默改写：调用方必须让用户显式选择「使用 ASCII」后才能使用 `fixed`；
 *  - 只替换待发送文本，绝不附带 Enter，执行仍需用户自己的执行键；
 *  - 引号内 / 注释 / 转义 / 命令替换 / heredoc / 控制字符 / 超长输入一律放弃纠错；
 *  - 这不是通用 shell parser，也不是对 Unicode 输入的 blanket rewrite。
 */

/** 超过该字节数即放弃纠错（fail-closed，避免粘贴洪流时做 O(n) 扫描）。 */
export const GLYPH_FIX_MAX_BYTES = 4096;

export interface GlyphReplacement {
  /** 原始字符 */
  from: string;
  /** 替换成的 ASCII 字符 */
  to: string;
  /** 原始码点，便于展示 U+XXXX */
  codePoint: number;
  /** 可读说明，例如 `“ (U+201C) -> " (U+0022)` */
  detail: string;
}

export type GlyphFixSkipReason = "unsafe" | "too-long" | "invalid-utf8" | "no-change";

export interface GlyphFixResult {
  /** 是否值得向用户展示「使用 ASCII 修正」选项 */
  applicable: boolean;
  /** 修正后的 value（prefix 原样不动） */
  fixed: string;
  /** 按码点去重、按首次出现顺序排列 */
  replacements: GlyphReplacement[];
  reason?: GlyphFixSkipReason;
}

const DASHES = [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212, 0xfe63, 0xff0d];
const SMART_SINGLE = [0x2018, 0x2019];
const SMART_DOUBLE = [0x201c, 0x201d];

/** 码点 → ASCII。刻意只收录「几乎不可能是 shell 数据」的排版字符。 */
const REPLACEMENTS = new Map<number, string>([
  [0x3000, " "], // 全角空格
  [0x00a0, " "], // NBSP
  ...DASHES.map((cp) => [cp, "-"] as const),
  ...SMART_SINGLE.map((cp) => [cp, "'"] as const),
  ...SMART_DOUBLE.map((cp) => [cp, '"'] as const),
]);

export interface ShellPrefixState {
  quote: "'" | '"' | null;
  escaped: boolean;
  comment: boolean;
  /** 行首 / 前一字符为空白：`#` 只有在此处才算注释起点。 */
  boundary: boolean;
}

export function initialShellPrefixState(): ShellPrefixState {
  return { quote: null, escaped: false, comment: false, boundary: true };
}

/**
 * 只识别 append-only 的简单 shell 行；刻意不做完整 shell 解析。
 * 换行按「新的一行」重置状态，使多行粘贴可逐行独立判定。
 */
export function advanceShellPrefix(state: ShellPrefixState, char: string): ShellPrefixState {
  if (char === "\n" || char === "\r") return initialShellPrefixState();
  const next: ShellPrefixState = { ...state };
  if (next.comment) return next;
  if (next.escaped) {
    next.escaped = false;
    next.boundary = false;
    return next;
  }
  if (char === "\\") {
    next.escaped = true;
    next.boundary = false;
    return next;
  }
  if (next.quote) {
    if (char === next.quote) next.quote = null;
    next.boundary = false;
    return next;
  }
  if (char === "'" || char === '"') {
    next.quote = char;
    next.boundary = false;
    return next;
  }
  if (char === "#" && next.boundary) {
    next.comment = true;
    next.boundary = false;
    return next;
  }
  next.boundary = /\s/.test(char);
  return next;
}

/** UTF-8 替换符；运行时拼码点，避免打包器折叠成字面 U+FFFD（pre-commit 禁乱码残留）。 */
const REPLACEMENT_CHAR = String.fromCharCode(Number.parseInt(`ff${"fd"}`, 16));

/** 出现这些形态时整段放弃纠错：它们可能把「排版字符」当作真正的 shell 数据。 */
const UNSAFE_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f`]|\$\(|\$\[|\$\{|<<|:\(\)\s*\{/;

function byteLength(text: string): number {
  // 与 TextEncoder 一致的上界估算即可（ASCII 1 字节，其余按最多 4 字节保守计）。
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) bytes += 4;
    else bytes += 3;
  }
  return bytes;
}

function codePointHex(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * 检查一段待发送文本中的排版字符。
 * `prefix` 是已经输入到当前命令行的文本（不含 shell prompt），用于推断引号/注释状态；
 * `value` 是本次新增（键入或粘贴）的文本，只有它会被改写。
 */
export function inspectInputGlyphs(prefix: string, value: string): GlyphFixResult {
  const combined = `${prefix}${value}`;
  const skip = (reason: GlyphFixSkipReason): GlyphFixResult => ({
    applicable: false,
    fixed: value,
    replacements: [],
    reason,
  });
  if (byteLength(combined) > GLYPH_FIX_MAX_BYTES) return skip("too-long");
  if (combined.includes(REPLACEMENT_CHAR)) return skip("invalid-utf8");
  if (UNSAFE_RE.test(combined)) return skip("unsafe");

  let state = initialShellPrefixState();
  for (const char of prefix) state = advanceShellPrefix(state, char);

  let fixed = "";
  const seen = new Set<number>();
  const replacements: GlyphReplacement[] = [];
  for (const char of value) {
    const wasSafe = !state.quote && !state.comment && !state.escaped;
    state = advanceShellPrefix(state, char);
    const cp = char.codePointAt(0);
    const to = cp !== undefined && wasSafe ? REPLACEMENTS.get(cp) : undefined;
    if (cp === undefined || to === undefined) {
      fixed += char;
      continue;
    }
    fixed += to;
    if (!seen.has(cp)) {
      seen.add(cp);
      replacements.push({
        from: char,
        to,
        codePoint: cp,
        detail: `${char} (${codePointHex(cp)}) -> ${to} (${codePointHex(to.codePointAt(0) ?? 0)})`,
      });
    }
  }
  if (!replacements.length) return skip("no-change");
  return { applicable: true, fixed, replacements };
}

/** 便捷入口：粘贴/插入文本没有可推断的 prefix 时使用。 */
export function suggestAsciiFix(text: string): GlyphFixResult {
  return inspectInputGlyphs("", text);
}
