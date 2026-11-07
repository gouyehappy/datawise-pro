import type {SqlCompletionContext} from '../context'
import type {SqlCompletionPlan} from '../grammar/types'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {
    filterRecentSqlForSuggest,
    recentSqlSuggestLabel,
} from '@sql-editor/utils/recent-sql'
import {categoryCompletionLabel, completionItemKind} from '../completion-labels'
import {buildFilterText} from '../filter-text'
import {completionSort} from './sort-state'
import type {SuggestPush, SuggestTextRange} from '../suggest-types'
import {localeT, typeT} from './collector-locale'

/** statement_start：按连接/库召回近期 SQL */
export function collectRecentSqlSuggestions(
    _ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    _plan: SqlCompletionPlan,
) {
    const runtime = getActiveSqlEditorRuntime()
    const items = runtime.getRecentQueries()
    if (!items.length) return

    const scope = runtime.getRecentQueryScope()
    // 空前缀只给少量历史，避免盖住 SELECT/WITH；有前缀时放宽匹配
    const filtered = filterRecentSqlForSuggest(items, prefix, {
        connectionId: scope.connectionId,
        database: scope.database,
        limit: prefix.trim() ? 8 : 3,
    })
    let index = 0
    for (const item of filtered) {
        const label = recentSqlSuggestLabel(item)
        push({
            label: categoryCompletionLabel(label, typeT('recent')),
            kind: completionItemKind('recent'),
            insertText: item.sql.trim(),
            detail: localeT('completion.recent.detail'),
            filterText: buildFilterText(label, [
                item.sql,
                ...(item.tables ?? []),
                'history',
                'recent',
            ]),
            range,
            sortText: completionSort('recent', index++),
            preselect: index === 1 && !prefix.trim(),
        })
    }
}
