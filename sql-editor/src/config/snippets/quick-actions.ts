import {mergeDialectSnippets} from '@sql-editor/constants/dialect-snippets'
import {mergeSnippetSources} from '@sql-editor/completion/snippet-sources'
import {snippetTitleKey} from '@sql-editor/completion/snippet-presentation'
import {
    getConfiguredGlobalSnippets,
    getConfiguredSlotSnippets,
} from '@sql-editor/config/snippets/cache'
import {buildDefaultSnippetConfigsFromConstants} from '@sql-editor/config/snippets/builtin'
import type {
    SqlCompletionSlot,
    SqlEditorShortcutsSettings,
    SqlQuickAction,
    SqlQuickChipConfig,
    SqlSnippet,
} from '@sql-editor/types'

/** 非片段类快捷芯片（关键字 / 特殊符号） */
const KEYWORD_QUICK_ACTIONS: Partial<Record<SqlCompletionSlot, SqlQuickAction[]>> = {
    select_list: [
        {id: 'star', label: '*', insertText: '*', triggerSuggest: true, titleKey: 'quick.star'},
    ],
    from: [
        {id: 'join', label: 'JOIN', insertText: '\nINNER JOIN ', triggerSuggest: true, titleKey: 'quick.join'},
    ],
    update_table: [
        {id: 'set', label: 'SET', insertText: 'SET ', kind: 'keyword', titleKey: 'quick.set'},
    ],
    where: [
        {id: 'and', label: 'AND', insertText: 'AND ', kind: 'keyword', titleKey: 'quick.and'},
        {id: 'or', label: 'OR', insertText: 'OR ', kind: 'keyword', titleKey: 'quick.or'},
        {id: 'not', label: 'NOT', insertText: 'NOT ', kind: 'keyword', titleKey: 'quick.not'},
    ],
    having: [
        {id: 'and', label: 'AND', insertText: 'AND ', kind: 'keyword', titleKey: 'quick.and'},
    ],
    order_by: [
        {id: 'asc', label: 'ASC', insertText: 'ASC', kind: 'keyword', titleKey: 'quick.asc'},
        {id: 'desc', label: 'DESC', insertText: 'DESC', kind: 'keyword', titleKey: 'quick.desc'},
    ],
}

/** 提示条优先展示的片段 label（按槽位）；未列出的片段仍可在补全里出现 */
export const HINT_SNIPPET_PRIORITY: Partial<Record<SqlCompletionSlot, readonly string[]>> = {
    statement_start: ['sel', 'cte', 'lf', 'crt', 'alt', 'del', 'upd', 'ins'],
    select_list: ['cnt', 'case', 'win'],
    join: ['ij', 'lf'],
    on: ['eq'],
    where: ['w1', 'in', 'like', 'between', 'null', 'exists', 'dt7', 'dt30'],
    group_by: ['cnt'],
    order_by: ['ord'],
    tail: ['lim', 'off', 'uni'],
}

const HINT_SNIPPET_LIMIT = 8

function listRuntimeSnippetsForSlot(slot: SqlCompletionSlot, dialect?: string | null): SqlSnippet[] {
    const slotSnippets = mergeDialectSnippets([...getConfiguredSlotSnippets(slot)], slot, dialect)
    const includeGlobals = slot === 'statement_start'
    return mergeSnippetSources(slotSnippets, getConfiguredGlobalSnippets(), includeGlobals, '')
}

function snippetToQuickAction(snippet: SqlSnippet): SqlQuickAction {
    return {
        id: snippet.label,
        label: snippet.label,
        insertText: snippet.insertText,
        snippet: true,
        titleKey: snippetTitleKey(snippet.label),
    }
}

function orderedSnippetQuickActions(
    slot: SqlCompletionSlot,
    dialect?: string | null,
): SqlQuickAction[] {
    const byLabel = new Map(
        listRuntimeSnippetsForSlot(slot, dialect).map((snippet) => [snippet.label.toLowerCase(), snippet]),
    )
    const priority = HINT_SNIPPET_PRIORITY[slot] ?? []
    const ordered: SqlQuickAction[] = []
    const seen = new Set<string>()

    for (const label of priority) {
        const key = label.toLowerCase()
        const snippet = byLabel.get(key)
        if (!snippet || seen.has(key)) continue
        seen.add(key)
        ordered.push(snippetToQuickAction(snippet))
        if (ordered.length >= HINT_SNIPPET_LIMIT) return ordered
    }

    for (const snippet of byLabel.values()) {
        const key = snippet.label.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        ordered.push(snippetToQuickAction(snippet))
        if (ordered.length >= HINT_SNIPPET_LIMIT) break
    }

    return ordered
}

function toQuickAction(chip: SqlQuickChipConfig): SqlQuickAction {
    const {enabled: _e, slots: _s, builtin: _b, ...action} = chip
    return action
}

/** 列出全部内置芯片（设置页展示用） */
export function listBuiltinQuickChipConfigs(): SqlQuickChipConfig[] {
    const result: SqlQuickChipConfig[] = []

    for (const [slot, actions] of Object.entries(KEYWORD_QUICK_ACTIONS) as [SqlCompletionSlot, SqlQuickAction[]][]) {
        for (const action of actions ?? []) {
            result.push({
                ...action,
                enabled: true,
                slots: [slot],
                builtin: true,
            })
        }
    }

    for (const config of buildDefaultSnippetConfigsFromConstants()) {
        if (!config.slots.length) continue
        const slot = config.slots[0]
        if (!HINT_SNIPPET_PRIORITY[slot]?.includes(config.label)) continue
        result.push({
            id: config.id,
            label: config.label,
            insertText: config.insertText,
            snippet: true,
            titleKey: snippetTitleKey(config.label),
            enabled: true,
            slots: config.slots,
            builtin: true,
        })
    }

    return result
}

export interface ResolveQuickActionsOptions {
    dialect?: string | null
    settings?: Pick<SqlEditorShortcutsSettings, 'showHintQuickChips' | 'disabledQuickChipIds' | 'quickChips'>
}

/** 合并关键字芯片 + 运行时片段芯片 + 自定义芯片 */
export function resolveQuickActionsForSlot(
    slot: SqlCompletionSlot,
    options: ResolveQuickActionsOptions = {},
): SqlQuickAction[] {
    const {dialect, settings} = options
    if (settings?.showHintQuickChips === false) return []

    const disabled = new Set((settings?.disabledQuickChipIds ?? []).map((id) => id.toLowerCase()))
    const seen = new Set<string>()
    const result: SqlQuickAction[] = []

    const push = (action: SqlQuickAction) => {
        const key = action.id.toLowerCase()
        if (disabled.has(key) || seen.has(key)) return
        seen.add(key)
        result.push(action)
    }

    for (const action of KEYWORD_QUICK_ACTIONS[slot] ?? []) {
        push(action)
    }

    for (const action of orderedSnippetQuickActions(slot, dialect)) {
        push(action)
    }

    for (const chip of settings?.quickChips ?? []) {
        if (!chip.enabled || !chip.slots.includes(slot)) continue
        push(toQuickAction(chip))
    }

    return result
}
