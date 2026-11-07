import type * as monaco from 'monaco-editor'
import type {SqlCompletionContext} from './context'
import type {SqlCompletionSlot} from '@sql-editor/types'
import {
    fromJoinQualifiedLocalPartial,
    fromJoinQualifiedUsesCursorInsert,
} from '@sql-editor/utils/from-qualified-input'

const CLAUSE_COLUMN_SLOTS: Partial<Record<SqlCompletionSlot, string>> = {
    on: 'ON',
    where: 'WHERE',
    having: 'HAVING',
}

/** ON / WHERE / HAVING 后正在输入的列前缀（不含子句关键字本身） */
export function prefixAfterClauseKeyword(lineBefore: string, clauseKeyword: string): string | null {
    const re = new RegExp(`\\b${clauseKeyword.replace(/\s+/g, '\\s+')}\\s*([\\w$.]*)$`, 'i')
    const match = re.exec(lineBefore)
    if (!match) return null
    return match[1] ?? ''
}

function clauseColumnInput(
    slot: SqlCompletionSlot,
    lineBefore: string,
): { partial: string } | null {
    const keyword = CLAUSE_COLUMN_SLOTS[slot]
    if (!keyword) return null
    const partial = prefixAfterClauseKeyword(lineBefore, keyword)
    if (partial === null) return null
    return {partial}
}

function cursorInsertRange(position: monaco.Position): monaco.IRange {
    return {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column,
        endColumn: position.column,
    }
}

/**
 * Range that replaces the full handwritten prefix ending at the cursor.
 * Used so accepting a keyword (WHERE / ORDER BY / …) never leaves a typed tail
 * like `oORDER BY` or `whWHERE`.
 */
export function rangeReplacingTypedPrefix(
    position: Pick<monaco.Position, 'lineNumber' | 'column'>,
    typedPrefix: string,
): monaco.IRange {
    const partial = typedPrefix ?? ''
    return {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: Math.max(1, position.column - partial.length),
        endColumn: position.column,
    }
}

/** Suggest-layer helper: expand/collapse an existing range to cover `typedPrefix`. */
export function suggestRangeReplacingTypedPrefix(
    range: {startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number},
    typedPrefix: string,
): {startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number} {
    const partial = typedPrefix ?? ''
    return {
        startLineNumber: range.endLineNumber,
        endLineNumber: range.endLineNumber,
        startColumn: Math.max(1, range.endColumn - partial.length),
        endColumn: range.endColumn,
    }
}

function fromJoinTablePartial(before: string): string | null {
    const match =
        before.match(/(?:FROM|JOIN)\s+([`"']?[\w$]+(?:\.[`"']?[\w$]+)*)$/i) ??
        before.match(/(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN\s+([`"']?[\w$]+(?:\.[`"']?[\w$]+)*)$/i)
    if (!match) return null
    return match[1]?.replace(/^[`"']|[`"']$/g, '') ?? ''
}

function fromJoinCompletionRange(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    partial: string,
): monaco.IRange {
    if (partial.includes('.')) {
        if (fromJoinQualifiedUsesCursorInsert(partial)) {
            return cursorInsertRange(position)
        }
        const local = fromJoinQualifiedLocalPartial(partial)
        return {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - local.length,
            endColumn: position.column,
        }
    }
    return {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - partial.length,
        endColumn: position.column,
    }
}

function lineBefore(model: monaco.editor.ITextModel, position: monaco.Position): string {
    return model.getLineContent(position.lineNumber).slice(0, position.column - 1)
}

/** 光标前是否为 `alias.` / `alias.*` / `alias.col`（点后可有尾随空白） */
function parseQualifiedColumnTail(before: string): {qualifier: string; partial: string} | null {
    const match = /([\w$`"']+)\.(\*|\w*)\s*$/.exec(before)
    if (!match) return null
    return {qualifier: match[1], partial: match[2] ?? ''}
}

/** SELECT 列表中的 `*`（Monaco 不把 * 当作 word） */
export function selectListStarBeforeCursor(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
): boolean {
    return /\*(?:\s*)$/.test(lineBefore(model, position))
}

/** 补全替换范围：column_ref 时只替换点号后的字段前缀 */
export function completionRange(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    ctx: SqlCompletionContext,
): monaco.IRange {
    const before = lineBefore(model, position)
    const qualified = parseQualifiedColumnTail(before)
    // 仅 `alias.` / `alias.*` 开槽时按点号后替换；完整 `alias.col` 不抢前缀
    const openQualifier = Boolean(qualified && (qualified.partial === '' || qualified.partial === '*'))
    if (ctx.slot === 'column_ref' || openQualifier) {
        if (qualified) {
            // 替换「点号之后到光标」整段（含尾随空格 / 已输入字段前缀）
            const afterDot = before.length - (before.lastIndexOf('.') + 1)
            return {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - afterDot,
                endColumn: position.column,
            }
        }
    }

    if (ctx.slot === 'select_list' && selectListStarBeforeCursor(model, position)) {
        return {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - 1,
            endColumn: position.column,
        }
    }

    if (ctx.slot === 'from' || ctx.slot === 'join') {
        const partial = fromJoinTablePartial(lineBefore(model, position))
        if (partial !== null) {
            return fromJoinCompletionRange(model, position, partial)
        }
    }

    const clauseInput = clauseColumnInput(ctx.slot, lineBefore(model, position))
    if (clauseInput) {
        const {partial} = clauseInput
        return {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - partial.length,
            endColumn: position.column,
        }
    }

    const word = model.getWordUntilPosition(position)
    return {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
    }
}

/** 当前正在输入的补全前缀（大小写不敏感匹配） */
export function completionPrefix(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    ctx?: SqlCompletionContext,
): string {
    const before = lineBefore(model, position)
    const qualified = parseQualifiedColumnTail(before)
    const openQualifier = Boolean(qualified && (qualified.partial === '' || qualified.partial === '*'))
    if (ctx?.slot === 'column_ref') {
        return ctx.columnPrefix === '*' ? '*' : (ctx.columnPrefix ?? '')
    }
    if (openQualifier) {
        return qualified?.partial === '*' ? '*' : ''
    }
    if (qualified) {
        return qualified.partial === '*' ? '*' : qualified.partial
    }

    if (ctx?.slot === 'select_list' && selectListStarBeforeCursor(model, position)) {
        return '*'
    }

    if (ctx?.slot === 'from' || ctx?.slot === 'join') {
        const partial = fromJoinTablePartial(lineBefore(model, position))
        if (partial !== null) {
            if (partial.includes('.')) {
                return fromJoinQualifiedLocalPartial(partial)
            }
            return partial
        }
    }

    if (ctx?.signals.after_complete_where_predicate || ctx?.signals.after_complete_on_predicate) {
        return model.getWordUntilPosition(position).word
    }

    if (ctx?.slot) {
        const clauseInput = clauseColumnInput(ctx.slot, lineBefore(model, position))
        if (clauseInput) return clauseInput.partial
    }

    return model.getWordUntilPosition(position).word
}

/** 表名已选定后：光标处插入，前缀不参与过滤（JOIN 限定词输入时保留前缀） */
export function effectiveCompletionInput(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    ctx: SqlCompletionContext,
): { range: monaco.IRange; prefix: string } {
    // 完整列引用后（SELECT 的 AS / 谓词运算符）：光标处插入，勿把列名当过滤前缀
    if (ctx.signals.after_select_list_complete_col || ctx.signals.after_complete_column_ref) {
        const before = lineBefore(model, position)
        const typingNextToken = /\s+[A-Za-z_][\w$]*$/i.test(before)
        if (!typingNextToken) {
            return {
                range: cursorInsertRange(position),
                prefix: '',
            }
        }
    }

    // `t1.` / `t1.col`：最先锁定点号后范围，避免被 FROM/JOIN 其它规则盖掉。
    // 仅 column_ref，或「别名.」开槽（防 select_list 误判）；不碰 FROM hive. 表限定输入。
    const before = lineBefore(model, position)
    const qualified = parseQualifiedColumnTail(before)
    if (qualified) {
        const qualifierKey = qualified.qualifier.replace(/^[`"']|[`"']$/g, '').toLowerCase()
        const openAlias =
            (qualified.partial === '' || qualified.partial === '*') &&
            Boolean(ctx.aliases[qualifierKey])
        // 完整已知列：不要走「替换点后字段」路径（由上方 after_complete 处理）
        const incompletePartial =
            qualified.partial !== '' &&
            qualified.partial !== '*' &&
            !ctx.signals.after_complete_column_ref
        if ((ctx.slot === 'column_ref' || openAlias) && (openAlias || incompletePartial || qualified.partial === '' || qualified.partial === '*')) {
            if (!ctx.signals.after_complete_column_ref) {
                const afterDot = before.length - (before.lastIndexOf('.') + 1)
                const partial = qualified.partial === '*' ? '*' : qualified.partial
                return {
                    range: {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: position.column - afterDot,
                        endColumn: position.column,
                    },
                    prefix: partial === '*' ? '*' : (partial || ''),
                }
            }
        }
    }

    const range = completionRange(model, position, ctx)
    const prefix = completionPrefix(model, position, ctx)

    if (ctx.signals.after_complete_where_predicate || ctx.signals.after_complete_on_predicate) {
        const word = model.getWordUntilPosition(position)
        return {
            range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            },
            prefix: word.word,
        }
    }

    if (ctx.fromJoin?.joinKeywordPrefix) {
        const partial = ctx.fromJoin.joinKeywordPrefix
        return {
            range: rangeReplacingTypedPrefix(position, partial),
            prefix: partial,
        }
    }

    if (ctx.fromJoin?.clauseKeywordPrefix) {
        const partial = ctx.fromJoin.clauseKeywordPrefix
        return {
            range: rangeReplacingTypedPrefix(position, partial),
            prefix: partial,
        }
    }

    if (ctx.fromJoin?.awaitingTableName || ctx.fromJoin?.awaitingJoinTable) {
        return {
            range: cursorInsertRange(position),
            prefix: '',
        }
    }

    // Table/alias complete: next tokens are clause keywords (WHERE / ORDER BY / …).
    // If the user is already typing a prefix, replace that whole word — never zero-width insert.
    if (ctx.fromJoin?.tableClauseComplete && !ctx.fromJoin.aliasOnLineAfterCursor) {
        const word = model.getWordUntilPosition(position)
        if (word.word) {
            return {
                range: {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                },
                prefix: word.word,
            }
        }
        return {
            range: cursorInsertRange(position),
            prefix: '',
        }
    }

    if (ctx.slot === 'on' || ctx.slot === 'where' || ctx.slot === 'having') {
        const clauseInput = clauseColumnInput(ctx.slot, lineBefore(model, position))
        if (clauseInput && clauseInput.partial === '') {
            return {range: cursorInsertRange(position), prefix: ''}
        }
    }

    return {range, prefix}
}
