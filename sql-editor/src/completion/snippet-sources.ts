import type {SqlSnippet} from '@sql-editor/types'
import {matchesCompletionPrefix} from './filter-text'

/** 合并槽位片段与全局片段；同 label 去重，槽位片段优先 */
export function mergeSnippetSources(
    slotSnippets: readonly SqlSnippet[],
    globalSnippets: readonly SqlSnippet[],
    includeGlobals: boolean,
    prefix: string,
): SqlSnippet[] {
    const byLabel = new Map<string, SqlSnippet>()

    for (const snippet of slotSnippets) {
        if (!matchesCompletionPrefix(snippet.label, prefix)) continue
        byLabel.set(snippet.label.toLowerCase(), snippet)
    }

    if (includeGlobals) {
        for (const snippet of globalSnippets) {
            const key = snippet.label.toLowerCase()
            if (byLabel.has(key)) continue
            if (!matchesCompletionPrefix(snippet.label, prefix)) continue
            byLabel.set(key, snippet)
        }
    }

    return [...byLabel.values()]
}
