/** 单行 SQL 注释，描述 AI 生成来源 */
export function formatAiPromptComment(prompt: string): string {
    const singleLine = prompt.replace(/\s+/g, ' ').trim()
    const safe = singleLine.replace(/\*\//g, '').slice(0, 160)
    return `-- AI: ${safe || 'generated SQL'}`
}

export function buildAiSqlBlock(prompt: string, generatedSql: string): string {
    return `${formatAiPromptComment(prompt)}\n${generatedSql.trim()}`
}

/** 将 AI 解释转为 SQL 注释块 */
export function buildAiExplanationBlock(prompt: string, explanation: string): string {
    const header = formatAiPromptComment(prompt)
    const body = explanation
        .trim()
        .split('\n')
        .map((line) => `-- ${line.replace(/\*\//g, '')}`)
        .join('\n')
    return `${header}\n${body}`
}

export interface AiSqlInsertPlan {
    /** 1-based line to focus after insert */
    focusLine: number
    /** splice start index (0-based, inclusive) */
    startLine: number
    /** splice end index (0-based, exclusive); equal startLine = insert without removing */
    endLine: number
    /** lines to insert */
    insertLines: string[]
    /** when true, append after document (endLine ignored) */
    append: boolean
    /** blank lines to prepend when appending */
    appendGapLines: number
}

/**
 * 在空行插入内容块；无空行则在文档末尾追加。
 * @param cursorLine 1-based
 */
export function planAiBlockInsert(
    sql: string,
    cursorLine: number,
    block: string,
): AiSqlInsertPlan {
    const insertLines = block.split('\n')
    const lines = sql.length ? sql.split('\n') : ['']
    const lineIdx = Math.max(0, Math.min(cursorLine - 1, lines.length - 1))

    for (let i = lineIdx; i < lines.length; i++) {
        if (lines[i]!.trim() === '') {
            return {
                focusLine: i + 1,
                startLine: i,
                endLine: i + 1,
                insertLines,
                append: false,
                appendGapLines: 0,
            }
        }
    }

    const trimmedEnd = sql.trimEnd()
    const baseLines = trimmedEnd.length ? trimmedEnd.split('\n') : []
    const appendGapLines = baseLines.length === 0 ? 0 : 2
    return {
        focusLine: baseLines.length + appendGapLines + 1,
        startLine: baseLines.length,
        endLine: baseLines.length,
        insertLines,
        append: true,
        appendGapLines,
    }
}

export function planAiSqlInsert(
    sql: string,
    cursorLine: number,
    prompt: string,
    generatedSql: string,
): AiSqlInsertPlan {
    return planAiBlockInsert(sql, cursorLine, buildAiSqlBlock(prompt, generatedSql))
}

export function applyAiSqlInsertPlan(sql: string, plan: AiSqlInsertPlan): string {
    if (plan.append) {
        const trimmed = sql.trimEnd()
        if (!trimmed) return plan.insertLines.join('\n')
        const gap = plan.appendGapLines > 0 ? '\n'.repeat(plan.appendGapLines) : ''
        return `${trimmed}${gap}${plan.insertLines.join('\n')}`
    }

    const lines = sql.length ? sql.split('\n') : ['']
    const next = [...lines]
    next.splice(plan.startLine, plan.endLine - plan.startLine, ...plan.insertLines)
    return next.join('\n')
}
