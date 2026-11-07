import type * as monaco from 'monaco-editor'
import type {SqlEditorSchema} from '@sql-editor/types'
import type {CompletionSnapshot} from '../core/snapshot'
import {effectiveCompletionInput} from '../range'
import {hasTablesInQuery} from '../context'
import {runCollectors} from './collectors'
import {setActiveCompletionPlan} from './sort-state'
import {injectSuggestGroupHeaders} from '../suggest-groups'
import type {SuggestEditorSlice, SuggestItem, SuggestTextRange} from '../suggest-types'
import {toMonacoSuggestItem} from '../monaco/suggest-adapter'

export interface SuggestBuildInput {
    snapshot: CompletionSnapshot
    editor: SuggestEditorSlice
    range: SuggestTextRange
    prefix: string
    schema: SqlEditorSchema
}

export function buildEditorSlice(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    range: SuggestTextRange,
): SuggestEditorSlice {
    return {
        lineAtRange: model.getLineContent(range.startLineNumber),
        fullSql: model.getValue(),
        cursorOffset: model.getOffsetAt({
            lineNumber: range.startLineNumber,
            column: range.endColumn,
        }),
        lineBeforeCursor: model.getLineContent(position.lineNumber).slice(0, position.column - 1),
    }
}

/** 根据 snapshot 生成补全项（与 Monaco 解耦，可单测） */
export function buildSuggestions(input: SuggestBuildInput): SuggestItem[] {
    const {snapshot, editor, range, prefix, schema} = input
    const {context: ctx, plan} = snapshot
    const suggestions: SuggestItem[] = []
    const push = (item: SuggestItem) => {
        suggestions.push(item)
    }

    setActiveCompletionPlan(plan)
    try {
        runCollectors({
            ctx,
            plan,
            push,
            editor,
            range,
            prefix,
            hasTables: hasTablesInQuery(ctx),
            schema,
        })
    } finally {
        setActiveCompletionPlan(null)
    }

    return injectSuggestGroupHeaders(suggestions, prefix)
}

export interface MonacoSuggestInput {
    snapshot: CompletionSnapshot
    model: monaco.editor.ITextModel
    position: monaco.Position
    schema: SqlEditorSchema
}

/** Monaco 适配：snapshot → CompletionItem[] */
export function buildMonacoSuggestions(
    input: MonacoSuggestInput,
): monaco.languages.CompletionItem[] {
    const {snapshot, model, position, schema} = input
    const {range, prefix} = effectiveCompletionInput(model, position, snapshot.context)
    const editor = buildEditorSlice(model, position, range)
    return buildSuggestions({snapshot, editor, range, prefix, schema}).map(toMonacoSuggestItem)
}
