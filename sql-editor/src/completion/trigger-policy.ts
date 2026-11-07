/** 光标前是否为 `alias.` / `alias.col` 形式的列限定引用 */
export const COLUMN_REF_LINE_TAIL = /\b[\w$]+\.\w*$/i

export const COLUMN_QUALIFIER_CHAR = '.'

/** 输入 `.` 后必须弹出列补全，不受「接受补全后抑制」影响 */
export function bypassesAutocompleteSuppress(triggerCharacter?: string): boolean {
    return triggerCharacter === COLUMN_QUALIFIER_CHAR
}

/** 编辑器内容变更后是否应调度 triggerSuggest（Monaco triggerCharacters 的兜底） */
export function shouldScheduleEditorAutoSuggest(changeText: string): boolean {
    if (!changeText) return false
    if (/[A-Za-z_]/.test(changeText)) return true
    return changeText.includes(COLUMN_QUALIFIER_CHAR)
}

/** 行尾是否处于列限定上下文（alias. 或 alias.col） */
export function lineBeforeIsColumnRef(lineBefore: string): boolean {
    return COLUMN_REF_LINE_TAIL.test(lineBefore.trimEnd())
}

/** 列限定上下文：alias. 后必须提供列补全，任何 guard 均不得中止 */
export function isMandatoryColumnSuggestContext(ctx: {
    slot: string
    resolvedTable: string | null
    qualifier: string | null
}): boolean {
    return ctx.slot === 'column_ref' && Boolean(ctx.resolvedTable && ctx.qualifier)
}
