import {computed, onUnmounted, shallowRef, watch, type Ref} from 'vue'
import {
    analyzeSqlCompletionContext,
    effectiveCompletionSlot,
    hasSignal,
    hasTablesInQuery,
    tablesReferencedInQuery,
} from '@sql-editor/completion/context'
import {scheduleSqlCompletionAnalysis, disposeCompletionWorker} from '@sql-editor/completion/completion-worker-client'
import {
    getSqlEditorFormatterSettings,
    getSqlEditorShortcutsSettings,
    sqlEditorSettingsVersion,
} from '@sql-editor/config/snippets/cache'
import {resolveQuickActionsForSlot} from '@sql-editor/constants/slot-quick-actions'
import {resolveAiQuickActionsForContext} from '@sql-editor/ai/hint-quick-actions'
import {resolveCompletionPlan} from '@sql-editor/completion/grammar/index'
import {nextKeywordHintsForPlan} from '@sql-editor/completion/plan-keywords'
import {buildKeywordInsert} from '@sql-editor/completion/keyword-insert'
import {
    formatKeybindingsTooltip,
    listHintKeybindings,
    summarizeKeybindingsForHint
} from '@sql-editor/editor/shortcut-config'
import {listQueryAliases} from '@sql-editor/utils/alias'
import {
    buildLeftJoinLineInsert,
    fkJoinLineCandidates,
} from '@sql-editor/utils/fk-join-lines'
import {adjustKeywordInsertNewlines} from '@sql-editor/utils/format-as-you-type'
import {schemaColumnCount} from '@sql-editor/utils/schema-metrics'
import {sqlEditorT} from '@sql-editor/i18n'
import type {
    SqlCompletionSlot,
    SqlEditorContextInfo,
    SqlEditorSchema,
    SqlEditorLocale,
    SqlQuickAction,
    SqlStatementKind
} from '@sql-editor/types'

const STATEMENT_LABEL: Record<SqlStatementKind, string> = {
    empty: '—',
    select: 'SELECT',
    insert: 'INSERT',
    update: 'UPDATE',
    delete: 'DELETE',
    ddl: 'DDL',
    unknown: 'SQL',
}

const SLOT_LABEL_KEY: Record<SqlCompletionSlot, string> = {
    statement_start: 'slot.label.statement_start',
    select_list: 'slot.label.select_list',
    from: 'slot.label.from',
    join: 'slot.label.join',
    on: 'slot.label.on',
    where: 'slot.label.where',
    group_by: 'slot.label.group_by',
    having: 'slot.label.having',
    order_by: 'slot.label.order_by',
    tail: 'slot.label.tail',
    set: 'slot.label.set',
    values: 'slot.label.values',
    insert_columns: 'slot.label.insert_columns',
    update_table: 'slot.label.update_table',
    column_ref: 'slot.label.column_ref',
}

const SLOT_HINT_KEY: Record<SqlCompletionSlot, string> = {
    statement_start: 'hint.slot.statement_start',
    select_list: 'hint.slot.select_list',
    from: 'hint.slot.from',
    join: 'hint.slot.join',
    on: 'hint.slot.on',
    where: 'hint.slot.where',
    group_by: 'hint.slot.group_by',
    having: 'hint.slot.having',
    order_by: 'hint.slot.order_by',
    tail: 'hint.slot.tail',
    set: 'hint.slot.set',
    values: 'hint.slot.values',
    insert_columns: 'hint.slot.insert_columns',
    update_table: 'hint.slot.update_table',
    column_ref: 'hint.slot.column_ref',
}

function buildHint(
    ctx: ReturnType<typeof analyzeSqlCompletionContext>,
    locale: SqlEditorLocale,
    plan: ReturnType<typeof resolveCompletionPlan>,
): string {
    let base: string
    if (hasSignal(ctx, 'after_comma') && (ctx.slot === 'select_list' || ctx.slot === 'where')) {
        base = sqlEditorT(locale, 'hint.after_comma')
    } else if (ctx.fromJoin?.awaitingJoinTable || ctx.fromJoin?.awaitingTableName) {
        base = sqlEditorT(locale, 'hint.awaiting_join_table')
    } else if (ctx.fromJoin?.awaitingOnClause) {
        base = sqlEditorT(locale, 'hint.awaiting_on')
    } else if (ctx.fromJoin?.tableClauseComplete) {
        const table = ctx.fromJoin.resolvedTable ?? ''
        if (ctx.statement === 'delete') {
            base = sqlEditorT(locale, 'hint.after_delete_table', {table})
        } else if (ctx.statement === 'update') {
            base = sqlEditorT(locale, 'hint.after_update_table', {table})
        } else if (ctx.statement === 'insert') {
            base = sqlEditorT(locale, 'hint.after_insert_table', {table})
        } else {
            base = sqlEditorT(locale, 'hint.after_table', {table})
        }
    } else if (hasSignal(ctx, 'after_select_list_item') || hasSignal(ctx, 'after_select_list_complete_col')) {
        base = sqlEditorT(locale, SLOT_HINT_KEY.select_list)
    } else if (hasSignal(ctx, 'after_complete_column_ref')) {
        base = sqlEditorT(locale, 'hint.after_column')
    } else if (hasSignal(ctx, 'after_predicate_operator')) {
        base = sqlEditorT(locale, 'hint.after_operator')
    } else if (hasSignal(ctx, 'after_condition_connector')) {
        base = sqlEditorT(locale, 'hint.after_connector')
    } else if (ctx.slot === 'column_ref' && !hasSignal(ctx, 'after_complete_column_ref')) {
        if (ctx.resolvedTable && ctx.qualifier) {
            base = sqlEditorT(locale, 'hint.column_ref.resolved', {
                alias: ctx.qualifier,
                table: ctx.resolvedTable,
            })
        } else if (ctx.qualifier) {
            base = sqlEditorT(locale, 'hint.column_ref.unresolved', {alias: ctx.qualifier})
        } else {
            base = sqlEditorT(locale, SLOT_HINT_KEY[ctx.slot])
        }
    } else if (ctx.slot === 'select_list' && !hasTablesInQuery(ctx)) {
        base = sqlEditorT(locale, 'hint.select_list.no_tables')
    } else if (ctx.slot === 'statement_start') {
        base = `${sqlEditorT(locale, SLOT_HINT_KEY.statement_start)} · ${sqlEditorT(locale, 'hint.snippet_tips')}`
    } else {
        base = sqlEditorT(locale, SLOT_HINT_KEY[ctx.slot])
    }

    let next = nextKeywordHintsForPlan(plan, ctx)
    if (hasSignal(ctx, 'after_select_list_item') || hasSignal(ctx, 'after_select_list_complete_col')) {
        next = ['AS', 'FROM']
    }
    // 仅在「下一步子句」或列后 AS/FROM 时追加，避免 SELECT 列表打字时提示过吵
    const showNext =
        next.length > 0 &&
        (plan.keywordPhase === 'clause-next' ||
            hasSignal(ctx, 'after_select_list_item') ||
            hasSignal(ctx, 'after_select_list_complete_col'))
    if (showNext) {
        const keywords = next.slice(0, 5).join(' · ')
        return `${base} · ${sqlEditorT(locale, 'hint.next_keywords', {keywords})}`
    }
    return base
}

/** 将下一步关键字做成可点芯片（插入片段并链式触发补全） */
function nextKeywordQuickActions(
    ctx: ReturnType<typeof analyzeSqlCompletionContext>,
    plan: ReturnType<typeof resolveCompletionPlan>,
    lineBefore: string,
): SqlQuickAction[] {
    const showNext =
        plan.keywordPhase === 'clause-next' ||
        hasSignal(ctx, 'after_select_list_item') ||
        hasSignal(ctx, 'after_select_list_complete_col')
    if (!showNext) return []
    let next = nextKeywordHintsForPlan(plan, ctx)
    if (hasSignal(ctx, 'after_select_list_item') || hasSignal(ctx, 'after_select_list_complete_col')) {
        next = ['AS', 'FROM']
    }
    return next.slice(0, 5).map((kw) => {
        const insert = buildKeywordInsert(kw, {
            trailingSpaceFallback: true,
            lineBefore,
        })
        return {
            id: `next-kw:${kw}`,
            label: kw,
            insertText: insert.insertText,
            kind: 'keyword' as const,
            snippet: insert.asSnippet,
            triggerSuggest: insert.chainSuggest,
        }
    })
}

/** after_table / JOIN 槽：FK 一键 LEFT JOIN 芯片（优先于通用关键字） */
function fkJoinQuickActions(
    ctx: ReturnType<typeof analyzeSqlCompletionContext>,
    plan: ReturnType<typeof resolveCompletionPlan>,
    schema: SqlEditorSchema,
    locale: SqlEditorLocale,
    sql: string,
    cursorOffset: number,
    lineBefore: string,
): SqlQuickAction[] {
    if (!plan.collectors.includes('fkJoinLines')) return []
    if (ctx.fromJoin?.joinKeywordPrefix || ctx.fromJoin?.awaitingJoinTable) return []

    const inQuery = tablesReferencedInQuery(ctx)
    if (!inQuery.length || !schema.foreignKeys?.length) return []

    const candidates = fkJoinLineCandidates(
        schema,
        inQuery,
        ctx.aliases,
        sql,
        lineBefore,
        cursorOffset,
    )
    return candidates.slice(0, 3).map((candidate) => {
        const insertText = adjustKeywordInsertNewlines(
            buildLeftJoinLineInsert(candidate),
            lineBefore,
            undefined,
            {leadingNewline: getSqlEditorFormatterSettings().formatAsYouType},
        )
        return {
            id: `fk-join:${candidate.targetTable}:${candidate.condition}`,
            label: sqlEditorT(locale, 'completion.fk_join_target_left', {
                table: candidate.targetTable,
            }),
            insertText,
            kind: 'text' as const,
            triggerSuggest: true,
        }
    })
}

/** Build context hint from SQL text and cursor offset */
export function useSqlEditorHints(
    sql: Ref<string>,
    cursorOffset: Ref<number>,
    schema: Ref<SqlEditorSchema>,
    locale: Ref<SqlEditorLocale>,
    dialect?: Ref<string | undefined>,
    aiCompletionReady?: Ref<boolean>,
    hasSelection?: Ref<boolean>,
) {
    const analyzedContext = shallowRef<ReturnType<typeof analyzeSqlCompletionContext> | null>(null)

    watch(
        [sql, cursorOffset, schema, dialect],
        () => {
            scheduleSqlCompletionAnalysis(
                sql.value,
                cursorOffset.value,
                schema.value.tables,
                schema.value.columns,
                (ctx) => {
                    analyzedContext.value = ctx
                },
                dialect?.value ?? 'mysql',
            )
        },
        {flush: 'post', immediate: true},
    )

    onUnmounted(() => disposeCompletionWorker())

    const shortcutHints = computed(() => {
        void sqlEditorSettingsVersion.value
        const settings = getSqlEditorShortcutsSettings()
        const loc = locale.value
        const labelOf = (key: string) =>
            sqlEditorT(loc, key as Parameters<typeof sqlEditorT>[1])
        return {
            shortcutItems: listHintKeybindings(settings.keybindings, labelOf),
            shortcutHint: summarizeKeybindingsForHint(settings.keybindings, labelOf),
            shortcutHintTitle: formatKeybindingsTooltip(settings.keybindings, labelOf),
        }
    })

    const contextInfo = computed<SqlEditorContextInfo>(() => {
        const ctx =
            analyzedContext.value ??
            analyzeSqlCompletionContext(
                sql.value,
                cursorOffset.value,
                schema.value.tables,
                schema.value.columns,
            )
        const effSlot = effectiveCompletionSlot(ctx)
        const settings = getSqlEditorShortcutsSettings()
        const loc = locale.value
        const plan = resolveCompletionPlan(ctx)
        const cursor = Math.max(0, Math.min(cursorOffset.value, sql.value.length))
        const lineStart = sql.value.lastIndexOf('\n', cursor - 1) + 1
        const lineBefore = sql.value.slice(lineStart, cursor)

        const chipsEnabled = settings.showHintQuickChips !== false
        const quickActions = chipsEnabled
            ? [
                  ...fkJoinQuickActions(ctx, plan, schema.value, loc, sql.value, cursor, lineBefore),
                  ...nextKeywordQuickActions(ctx, plan, lineBefore),
                  ...resolveQuickActionsForSlot(effSlot, {
                      dialect: dialect?.value,
                      settings,
                  }),
              ].filter((action) => {
                  if (
                      hasSignal(ctx, 'after_condition_connector')
                      && (action.id === 'and' || action.id === 'or')
                  ) {
                      return false
                  }
                  if (hasSignal(ctx, 'after_predicate_operator')) {
                      return false
                  }
                  return true
              })
            : []

        // 按 id 去重，保留先出现的（next-kw 优先于同名片段芯片）
        const seenIds = new Set<string>()
        const dedupedActions = quickActions.filter((action) => {
            const key = action.id.toLowerCase()
            if (seenIds.has(key)) return false
            seenIds.add(key)
            return true
        })

        if (chipsEnabled && aiCompletionReady?.value) {
            dedupedActions.push(
                ...resolveAiQuickActionsForContext(ctx, plan, {
                    aiReady: true,
                    hasSelection: hasSelection?.value ?? false,
                    locale: loc,
                }),
            )
        }

        return {
            statement: ctx.statement,
            slot: ctx.slot,
            slotLabel: sqlEditorT(locale.value, SLOT_LABEL_KEY[effSlot] as Parameters<typeof sqlEditorT>[1]),
            hint: buildHint(ctx, locale.value, plan),
            tableCount: schema.value.tables.length,
            columnCount: schemaColumnCount(schema.value),
            aliases: listQueryAliases(ctx.aliases),
            quickActions: dedupedActions,
            completionDebug: {
                stage: plan.stage,
                keywordSlot: String(plan.keywordSlot),
                keywordPhase: plan.keywordPhase,
            },
            ...shortcutHints.value,
        }
    })

    const statementLabel = computed(() => STATEMENT_LABEL[contextInfo.value.statement])

    return {
        contextInfo,
        statementLabel,
        shortcutHints,
    }
}
