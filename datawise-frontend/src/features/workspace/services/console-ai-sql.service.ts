const AI_SQL_COMMENT_RE = /^--\s*AI\s*:/i

function sanitizePromptForComment(prompt: string): string {
    return prompt.replace(/\s+/g, ' ').trim()
}

/** 为控制台 AI 生成结果补上标准注释头 */
export function formatConsoleAiSqlBlock(prompt: string, sql: string): string {
    const trimmed = sql.trim()
    if (!trimmed) {
        return `-- AI: ${sanitizePromptForComment(prompt)}`
    }

    const firstLine = trimmed.split('\n')[0]?.trim() ?? ''
    if (AI_SQL_COMMENT_RE.test(firstLine)) {
        return trimmed
    }

    return `-- AI: ${sanitizePromptForComment(prompt)}\n${trimmed}`
}

/** 将 AI 生成 SQL 追加到编辑器末尾（不覆盖已有内容） */
export function appendConsoleAiSql(
    existing: string,
    prompt: string,
    generated: string,
): { text: string; focusLine: number } {
    const block = formatConsoleAiSqlBlock(prompt, generated)
    const base = existing.replace(/\s+$/, '')
    if (!base) {
        return {text: block, focusLine: 1}
    }
    const baseLineCount = base.split('\n').length
    return {
        text: `${base}\n\n${block}`,
        focusLine: baseLineCount + 2,
    }
}
