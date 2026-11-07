/** 从数据库错误信息中解析行号（多方言常见格式） */
export function parseSqlErrorLine(message: string, sql?: string): number | null {
    if (!message?.trim()) return null

    const linePatterns = [
        /\bat line (\d+)\b/i,
        /,\s*Line (\d+)\b/i,
        /\bLine (\d+)\b/,
        /\bline (\d+)\b/,
        /在第 (\d+) 行/,
    ]

    for (const pattern of linePatterns) {
        const match = pattern.exec(message)
        if (!match) continue
        const line = Number.parseInt(match[1], 10)
        if (Number.isFinite(line) && line > 0) return line
    }

    const positionMatch = /(?:Position|position)[:\s]+(\d+)/i.exec(message)
    if (positionMatch && sql) {
        const position = Number.parseInt(positionMatch[1], 10)
        if (Number.isFinite(position) && position > 0) {
            const index = Math.min(position - 1, sql.length)
            return sql.slice(0, index).split('\n').length
        }
    }

    return null
}

/** 在文本中定位 trim 后 SQL 的起始行（1-based） */
function lineOffsetBeforeTrim(text: string, trimmed: string): number {
    if (!trimmed) return 1
    const index = text.indexOf(trimmed)
    if (index < 0) {
        const firstLine = trimmed.split('\n')[0] ?? trimmed
        const fuzzy = text.indexOf(firstLine)
        if (fuzzy < 0) return 1
        return text.slice(0, fuzzy).split('\n').length
    }
    return text.slice(0, index).split('\n').length
}

/**
 * 将「已 trim 后 SQL 内的行号」映射到编辑器绝对行号。
 * 后端与 JDBC 报错行号均相对 trim(sql) 后的文本。
 */
export function resolveEditorErrorLine(options: {
    editorText: string
    executable: string
    errorLineInSql: number | null
    selectionStartLine: number | null
}): number | null {
    const {editorText, executable, errorLineInSql, selectionStartLine} = options
    if (errorLineInSql === null || errorLineInSql < 1) return null

    const trimmedExecutable = executable.trim()

    if (selectionStartLine !== null && selectionStartLine > 0) {
        const trimOffsetInSelection = executable.indexOf(trimmedExecutable)
        const linesBeforeTrimInSelection =
            trimOffsetInSelection >= 0
                ? executable.slice(0, trimOffsetInSelection).split('\n').length - 1
                : 0
        return selectionStartLine + linesBeforeTrimInSelection + errorLineInSql - 1
    }

    return lineOffsetBeforeTrim(editorText, trimmedExecutable) + errorLineInSql - 1
}

/** 从 API 错误 payload 读取 errorLine */
export function readApiErrorLine(data: unknown): number | null {
    if (!data || typeof data !== 'object') return null
    const line = (data as { errorLine?: unknown }).errorLine
    if (typeof line === 'number' && line > 0) return line
    return null
}
