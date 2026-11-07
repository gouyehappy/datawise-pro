/** 补全项标签（与 Monaco CompletionItem.label 同形） */
export type SuggestLabel = string | { label: string; detail?: string; description?: string }

export const SUGGEST_INSERT_AS_SNIPPET = 'insert-as-snippet' as const
export type SuggestInsertTextRule = typeof SUGGEST_INSERT_AS_SNIPPET

export interface SuggestTextRange {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}

export interface SuggestCommand {
    id: string
    title: string
    arguments?: unknown[]
}

/** 与 Monaco 解耦的补全项 — 在 builders 层生成，monaco 适配层再转换 */
export interface SuggestItem {
    label: SuggestLabel
    kind: number
    insertText: string
    insertTextRules?: SuggestInsertTextRule
    detail?: string
    documentation?: string | { value: string; isTrusted?: boolean }
    /** 分组标题行（接受时不插入，仅用于视觉分段） */
    suggestHeader?: boolean
    filterText?: string
    range: SuggestTextRange
    sortText?: string
    preselect?: boolean
    command?: SuggestCommand
}

export type SuggestPush = (item: SuggestItem) => void

/** 从编辑器读取的片段上下文（避免 collectors 依赖 monaco-editor） */
export interface SuggestEditorSlice {
    lineAtRange: string
    fullSql: string
    cursorOffset: number
    lineBeforeCursor: string
}
