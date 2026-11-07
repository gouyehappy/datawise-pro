import type {SqlFunctionSignature} from './function-config'

/** 函数补全仅用名称过滤，避免 Monaco 模糊匹配到无关项 */
export function functionFilterText(name: string): string {
    return name
}

function stripOuterParens(value: string): string {
    let s = value.trim()
    while (s.startsWith('(') && s.endsWith(')')) {
        s = s.slice(1, -1).trim()
    }
    return s
}

/** 将配置签名拆成参数标签（Signature Help / 文档） */
export function parseSignatureParams(signature?: string): string[] {
    if (!signature?.trim()) return []
    const inner = stripOuterParens(signature.trim())
    if (!inner) return []
    const parts: string[] = []
    let depth = 0
    let buf = ''
    for (const ch of inner) {
        if (ch === '(' || ch === '[' || ch === '{') depth++
        else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)
        if (ch === ',' && depth === 0) {
            const t = buf.trim()
            if (t) parts.push(t)
            buf = ''
            continue
        }
        buf += ch
    }
    const last = buf.trim()
    if (last) parts.push(last)
    return parts
}

export type ActiveFunctionCall = {
    name: string
    /** 0-based 当前参数下标 */
    activeParameter: number
}

/**
 * 从光标前文本解析「正在填写的函数调用」：NAME( … | … )。
 * 用于 Monaco Signature Help。
 */
export function findActiveFunctionCall(textBeforeCursor: string): ActiveFunctionCall | null {
    const text = textBeforeCursor
    let i = text.length - 1
    let depth = 0
    let activeParameter = 0
    let closeAt = -1

    while (i >= 0) {
        const ch = text[i]
        if (ch === ')') {
            depth++
        } else if (ch === '(') {
            if (depth === 0) {
                closeAt = i
                break
            }
            depth--
        } else if (ch === ',' && depth === 0) {
            activeParameter++
        } else if ((ch === "'" || ch === '"' || ch === '`') && depth === 0) {
            const quote = ch
            i--
            while (i >= 0 && text[i] !== quote) i--
        }
        i--
    }
    if (closeAt < 0) return null

    const before = text.slice(0, closeAt)
    const nameMatch = /(?:^|[^A-Za-z0-9_`"])([A-Za-z_][\w$]*)\s*$/.exec(before)
    if (!nameMatch) return null
    return {name: nameMatch[1], activeParameter}
}

/** 将配置签名转为 snippet 占位文本（如 [DISTINCT] expr → DISTINCT expr） */
export function signaturePlaceholderText(signature?: string): string | undefined {
    if (!signature?.trim()) return undefined
    const inner = stripOuterParens(signature.trim())
    if (!inner) return undefined
    return inner.replace(/^\[DISTINCT\]\s*/i, 'DISTINCT ').trim()
}

/** 列表展示用签名，保留可选参数方括号 */
export function formatFunctionDisplaySignature(signature?: string): string | undefined {
    if (!signature?.trim()) return undefined
    const trimmed = signature.trim()
    return trimmed.startsWith('(') ? trimmed : `(${trimmed})`
}

/** 生成 Monaco snippet：SUM(${1:DISTINCT expr})；配置 insert 列可覆盖 */
export function buildFunctionInsertSnippet(fn: SqlFunctionSignature): string {
    if (fn.insertText?.trim()) return fn.insertText.trim()
    const placeholder = signaturePlaceholderText(fn.signature)
    if (!placeholder) return `${fn.name}($0)`
    return `${fn.name}(\${1:${placeholder}})`
}
