export type SqlExecuteMode = 'auto' | 'selection' | 'statement' | 'all'

export type ExecutableSqlResolution = {
    sql: string
    /** 选区或光标语句在编辑器中的起始行（1-based），用于错误行映射 */
    anchorLine?: number | null
}

export type ResolveExecutableSqlOptions = {
    /** 执行语义；默认 auto（选区 → 当前语句 → 全文） */
    mode?: SqlExecuteMode
    fallbackToCurrentLineSql?: () => string
    getCurrentLineNumber?: () => number | null
    fallbackToFullDocument?: () => string
    getSelectionStartLine?: () => number | null
}

/** 控制台执行 SQL：显式 string → 按 mode / 智能回退解析可执行文本 */
export function resolveExecutableSql(
    executableOverride: unknown,
    getSelectedText: () => string,
    options?: ResolveExecutableSqlOptions,
): ExecutableSqlResolution {
    if (typeof executableOverride === 'string') {
        const trimmed = executableOverride.trim()
        if (trimmed) return {sql: trimmed}
    }

    const mode = options?.mode ?? 'auto'

    if (mode === 'selection') {
        const selected = getSelectedText().trim()
        if (!selected) return {sql: ''}
        return {
            sql: selected,
            anchorLine: options?.getSelectionStartLine?.() ?? null,
        }
    }

    if (mode === 'statement') {
        const onCurrentLine = options?.fallbackToCurrentLineSql?.().trim()
        if (!onCurrentLine) return {sql: ''}
        return {
            sql: onCurrentLine,
            anchorLine: options?.getCurrentLineNumber?.() ?? null,
        }
    }

    if (mode === 'all') {
        const full = options?.fallbackToFullDocument?.()?.trim() ?? ''
        return {sql: full}
    }

    const selected = getSelectedText().trim()
    if (selected) {
        return {
            sql: selected,
            anchorLine: options?.getSelectionStartLine?.() ?? null,
        }
    }
    const onCurrentLine = options?.fallbackToCurrentLineSql?.().trim()
    if (onCurrentLine) {
        return {
            sql: onCurrentLine,
            anchorLine: options?.getCurrentLineNumber?.() ?? null,
        }
    }
    if (options?.fallbackToFullDocument) {
        return {sql: options.fallbackToFullDocument().trim()}
    }
    return {sql: ''}
}
