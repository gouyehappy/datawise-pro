import * as monaco from 'monaco-editor'
import type {SuggestItem, SuggestTextRange} from '../suggest-types'
import {SUGGEST_INSERT_AS_SNIPPET} from '../suggest-types'

export function toMonacoRange(range: SuggestTextRange): monaco.IRange {
    return {...range}
}

export function toMonacoSuggestItem(item: SuggestItem): monaco.languages.CompletionItem {
    const base: monaco.languages.CompletionItem = {
        label: item.label,
        kind: item.kind as monaco.languages.CompletionItemKind,
        insertText: item.suggestHeader ? '' : item.insertText,
        insertTextRules:
            item.insertTextRules === SUGGEST_INSERT_AS_SNIPPET
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
        detail: item.detail,
        documentation: item.documentation,
        filterText: item.filterText,
        range: toMonacoRange(item.range),
        sortText: item.sortText,
        preselect: item.suggestHeader ? false : item.preselect,
        command: item.command,
    }
    if (item.suggestHeader) {
        // 标题行：接受时不改文本（塌缩 range + 空 insertText）
        base.commitCharacters = []
        base.insertText = ''
        const r = item.range
        base.range = {
            startLineNumber: r.startLineNumber,
            endLineNumber: r.endLineNumber,
            startColumn: r.endColumn,
            endColumn: r.endColumn,
        }
    }
    return base
}
