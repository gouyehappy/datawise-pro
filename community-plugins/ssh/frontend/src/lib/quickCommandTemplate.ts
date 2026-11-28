/**
 * 快速命令参数占位符（对标「把存着的死字符串变成可复用模板」）。
 *
 * 纯函数层。设计约束：
 *  - 只识别 `{{name}}` / `{{name=default}}`，**不识别 `$1`、`${VAR}`**：
 *    这些在 shell 里是合法语法，拿来做占位符会破坏已有命令；
 *  - `{{` 在 shell 中几乎不合法（brace expansion 用单花括号 `{a,b}`），
 *    因此是安全的哨兵；未闭合的 `{{` 只报告、不改写；
 *  - 渲染结果绝不把 `{{…}}` 原文发进 PTY：未填且无默认值的变量列入
 *    `unresolved`，调用方必须先让用户填完再发送；
 *  - 填入值剥离 CR/LF 与控制字符、限制长度，防止通过参数偷偷注入第二条命令。
 */

export interface QuickCommandVariable {
  name: string;
  /** `{{name=default}}` 中的默认值；无默认值时为 undefined */
  defaultValue?: string;
  /** 在命令中出现的次数（同一变量只解析一次） */
  occurrences: number;
}

export interface ParsedQuickCommandTemplate {
  hasVariables: boolean;
  variables: QuickCommandVariable[];
  /** 存在未闭合的 `{{`，此时命令按普通文本处理 */
  unclosed: boolean;
}

export interface RenderedQuickCommandTemplate {
  text: string;
  /** 未填写且无默认值的变量名；非空时不应发送 */
  unresolved: string[];
}

export const TEMPLATE_VALUE_MAX_LENGTH = 200;

const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*(?:=\s*([^}\r\n]*))?\s*\}\}/g;

/** 解析命令中的模板变量：按名称去重，保留首次出现顺序与默认值。 */
export function parseQuickCommandTemplate(command: string): ParsedQuickCommandTemplate {
  const source = typeof command === "string" ? command : "";
  const variables: QuickCommandVariable[] = [];
  const index = new Map<string, number>();
  let matched = 0;
  for (const match of source.matchAll(VARIABLE_RE)) {
    matched += 1;
    const name = match[1];
    const rawDefault = match[2];
    const defaultValue = rawDefault === undefined ? undefined : rawDefault.trim();
    const existing = index.get(name);
    if (existing !== undefined) {
      variables[existing].occurrences += 1;
      continue;
    }
    index.set(name, variables.length);
    variables.push({
      name,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      occurrences: 1,
    });
  }
  const openCount = source.split("{{").length - 1;
  return {
    hasVariables: variables.length > 0,
    variables,
    unclosed: openCount > matched,
  };
}

/** 清理用户填入的值：去掉换行/控制字符并截断，避免注入额外的 PTY 行。 */
export function sanitizeTemplateValue(value: string): string {
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
  return cleaned.slice(0, TEMPLATE_VALUE_MAX_LENGTH);
}

/**
 * 渲染模板。`values` 中缺失的变量回落到默认值；仍缺失则记入 `unresolved`
 * 并在该位置留空（调用方须在 unresolved 非空时禁止发送）。
 */
export function renderQuickCommandTemplate(
  command: string,
  values: Readonly<Record<string, string>>,
): RenderedQuickCommandTemplate {
  const source = typeof command === "string" ? command : "";
  const unresolved: string[] = [];
  let cursor = 0;
  let text = "";
  for (const match of source.matchAll(VARIABLE_RE)) {
    const start = match.index ?? 0;
    text += source.slice(cursor, start);
    const name = match[1];
    const rawDefault = match[2];
    const supplied = values[name];
    let value: string;
    if (supplied !== undefined && supplied !== "") {
      value = sanitizeTemplateValue(supplied);
    } else if (rawDefault !== undefined) {
      value = sanitizeTemplateValue(rawDefault.trim());
    } else {
      value = "";
      if (!unresolved.includes(name)) unresolved.push(name);
    }
    text += value;
    cursor = start + match[0].length;
  }
  text += source.slice(cursor);
  return { text, unresolved };
}

/** 表单初始值：有默认值的变量预先填入。 */
export function defaultTemplateValues(parsed: ParsedQuickCommandTemplate): Record<string, string> {
  const values: Record<string, string> = {};
  for (const variable of parsed.variables) {
    values[variable.name] = variable.defaultValue ?? "";
  }
  return values;
}
