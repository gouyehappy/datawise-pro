/** Monaco CompletionItemKind 数值（避免在 Node 测试中加载 monaco-editor） */
export type CompletionDisplayCategory =
    | 'table'
    | 'catalog'
    | 'schema'
    | 'column'
    | 'function'
    | 'keyword'
    | 'snippet'
    | 'alias'
    | 'fk'
    | 'expand'
    | 'ai'
    | 'recent'
    | 'value'
    | 'value_string'
    | 'value_number'
    | 'group_by'
    | 'order_by'
    | 'ordinal'

/**
 * 类别 → Monaco kind（决定 CSS 钩子；字形在 SqlMonacoHost 换成 SQL 语义图标）
 *
 * catalog  Module→database · schema Interface→layers · table Struct→table
 * column   Field · alias Variable→tag · keyword Keyword→key · snippet Snippet→file-code
 * fk       Reference→link · expand Event→list-tree · ai User→sparkle · recent Enum→history
 * （不用 Folder：有文件图标主题时 Monaco 会走文件夹图标逻辑，CSS 换不了）
 */
const COMPLETION_ITEM_KIND = {
    catalog: 8, // Module
    schema: 7, // Interface
    table: 6, // Struct
    column: 3, // Field
    function: 1, // Function
    group_by: 3,
    order_by: 3,
    ordinal: 3,
    keyword: 17, // Keyword
    snippet: 28, // Snippet
    alias: 4, // Variable
    fk: 21, // Reference
    expand: 10, // Event
    ai: 25, // User
    recent: 15, // Enum
    value: 13, // Value
    value_string: 14, // Constant — 字符串模板（Text 在 showWords:false 时会被过滤）
    value_number: 12, // Unit
} as const satisfies Record<CompletionDisplayCategory, number>

/** 补全类别 → Monaco 内置图标（左侧小图标） */
export function completionItemKind(category: CompletionDisplayCategory): number {
    return COMPLETION_ITEM_KIND[category]
}

export type CompletionItemLabel = {
    label: string
    detail?: string
    description?: string
}

/** 右侧类型说明（如「表」「字段」「关键字」） */
export function categoryCompletionLabel(
    name: string,
    typeLabel: string,
    inlineDetail?: string,
): CompletionItemLabel {
    return {
        label: name,
        detail: inlineDetail,
        description: typeLabel,
    }
}

export function formatInlineScope(value?: string): string | undefined {
    if (!value?.trim()) return undefined
    return `(${value.trim()})`
}

/** 补全列表旁注用：截断字段注释（按码点，避免拆开 emoji） */
export function formatColumnCommentHint(comment?: string, maxChars = 16): string | undefined {
    const text = comment?.replace(/\s+/g, ' ').trim()
    if (!text) return undefined
    const chars = [...text]
    if (chars.length <= maxChars) return text
    return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`
}

/** 列补全：名称旁挂 (alias)/PK/FK/注释短注，右侧单独类型（便于等宽排版） */
export function columnCompletionLabel(
    name: string,
    meta: { type?: string; pk?: boolean; comment?: string },
    typeLabel: string,
    tableSource?: string,
    options?: {showComment?: boolean; fk?: boolean},
): CompletionItemLabel {
    const bits: string[] = []
    const scope = formatInlineScope(tableSource)
    if (scope) bits.push(scope)
    if (meta.pk) bits.push('PK')
    if (options?.fk) bits.push('FK')
    if (options?.showComment) {
        const hint = formatColumnCommentHint(meta.comment)
        if (hint) bits.push(hint)
    }
    return {
        label: name,
        detail: bits.length ? bits.join(' · ') : undefined,
        description: formatSqlTypeHint(meta.type) || typeLabel,
    }
}

/** 函数补全：签名并入 label（避免 label.detail 被挤没）；返回类型走 label.description */
export function functionCompletionLabel(
    name: string,
    typeLabel: string,
    signature?: string,
    returns?: string,
): CompletionItemLabel {
    const displaySignature = signature?.trim()
        ? signature.trim().startsWith('(')
            ? signature.trim()
            : `(${signature.trim()})`
        : ''
    return {
        label: `${name}${displaySignature}`,
        description: returns?.trim() || typeLabel,
    }
}

/**
 * 表补全右侧长文案（"Table · alias pr" / "外键关联"）→ 名称旁短注。
 * 右侧 description 只保留短徽标（TBL），避免 details 列被裁成「lias pr」。
 */
export function formatTableBesideHint(rightDetail?: string): string | undefined {
    if (!rightDetail?.trim()) return undefined
    const bits: string[] = []
    for (const part of rightDetail.split('|').map((s) => s.trim()).filter(Boolean)) {
        const alias = part.match(/(?:alias|reuse|别名|沿用)\s+(\S+)\s*$/i)
        if (alias) {
            bits.push(`→ ${alias[1]}`)
            continue
        }
        if (/^(Table|表)$/i.test(part)) continue
        if (/foreign\s*key|外键/i.test(part)) {
            bits.push('FK')
            continue
        }
        bits.push(part)
    }
    return bits.length ? bits.join(' · ') : undefined
}

/** 表补全：名称旁 catalog/别名/注释短注，右侧固定类型徽标 */
export function tableCompletionLabel(
    table: string,
    typeLabel: string,
    _aliasPreview?: string,
    catalog?: string,
    rightDetail?: string,
    options?: {comment?: string; showComment?: boolean},
): CompletionItemLabel {
    const beside = [
        formatInlineScope(catalog),
        formatTableBesideHint(rightDetail),
        options?.showComment ? formatColumnCommentHint(options.comment) : undefined,
    ]
        .filter(Boolean)
        .join(' ')
    return {
        label: table,
        detail: beside || undefined,
        description: typeLabel,
    }
}

/** 从 insertText 提取表名后的别名预览（如 `users u` → `u`） */
export function tableAliasPreview(insertText: string, table: string): string | undefined {
    if (!insertText || !insertText.startsWith(table)) return undefined
    const rest = insertText.slice(table.length).trim()
    return rest || undefined
}

/** 补全项：主标签 + 右侧说明 + 类型徽标 */
export function hintCompletionPresentation(
    name: string,
    hint: string,
    typeLabel: string,
    inlineDetail?: string,
): {
    label: CompletionItemLabel
    detail: string
    documentation?: { value: string; isTrusted: boolean }
} {
    const summary = hint.trim() || typeLabel
    const doc =
        summary !== typeLabel
            ? {value: summary, isTrusted: true}
            : undefined

    return {
        label: categoryCompletionLabel(name, typeLabel, inlineDetail),
        detail: summary,
        documentation: doc,
    }
}

/** 片段补全：主列表仅 trigger + 类型；说明与 SQL 在二级面板 */
export function snippetCompletionPresentation(
    name: string,
    hint: string,
    typeLabel: string,
    insertText: string,
): {
    label: CompletionItemLabel
    detail: string
    documentation: { value: string; isTrusted: boolean }
} {
    const summary = hint.trim() || typeLabel
    const fullSql = formatSnippetSqlPreview(insertText, 'full')
    const docBody = fullSql || summary

    return {
        label: categoryCompletionLabel(name, typeLabel),
        detail: summary,
        documentation: {value: docBody, isTrusted: true},
    }
}

import {formatSnippetSqlPreview, simplifySnippetInsertText} from './snippet-presentation'

/** 将 Monaco snippet 模板转为可读 SQL 预览 */
export {simplifySnippetInsertText} from './snippet-presentation'

/** 右侧类型提示：收敛冗长类型名，保持 SQL 小写风格 */
export function formatSqlTypeHint(raw?: string): string | undefined {
    if (!raw?.trim()) return undefined
    let t = raw.trim()
    const lower = t.toLowerCase()
    const aliases: Array<[string, string]> = [
        ['character varying', 'varchar'],
        ['double precision', 'float8'],
        ['timestamp with time zone', 'timestamptz'],
        ['timestamp without time zone', 'timestamp'],
        ['time with time zone', 'timetz'],
        ['time without time zone', 'time'],
    ]
    for (const [from, to] of aliases) {
        if (lower === from || lower.startsWith(`${from}(`) || lower.startsWith(`${from} `)) {
            t = to + t.slice(from.length)
            break
        }
    }
    // 类型名小写，长度等参数原样保留：VARCHAR(64) → varchar(64)
    return t.replace(/^([A-Za-z_][\w\s]*)/, (base) => base.toLowerCase().replace(/\s+/g, ' ').trim())
}

/** @deprecated 兼容旧调用；新 UI 用 formatSqlTypeHint + 名称旁 PK */
export function columnTypeBadge(meta: { type?: string; pk?: boolean }, fallback: string): string {
    const type = formatSqlTypeHint(meta.type)
    if (meta.pk && type) return `PK · ${type}`
    if (meta.pk) return 'PK'
    return type || fallback
}
