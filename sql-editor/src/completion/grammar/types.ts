import type {CompletionCollector} from '../completion-collectors'
import type {CompletionSortProfile, KeywordPhase} from '../completion-phase'
import type {ColumnMatchMode} from '../policy/collector-gate'
import type {SqlCompletionSlot} from '@sql-editor/types'

/**
 * 补全阶段 — 比 slot 更细，描述「此刻在句法链路的哪一步」。
 * 所有 collectors / 排序 / 关键字策略在 grammar/plans.ts 中集中定义。
 */
export type CompletionStage =
// FROM / JOIN 选表
    | 'table.pick'
    | 'table.clause_next'
    | 'join.await_table'
    | 'join.on_keyword'
    // ON / WHERE / HAVING / SET 谓词链
    | 'predicate.pick_column'
    | 'predicate.pick_fk_on_column'
    | 'predicate.after_column'
    | 'predicate.pick_value'
    | 'predicate.after_connector'
    | 'predicate.after_on_complete'
    | 'predicate.after_where_complete'
    | 'predicate.after_having_complete'
    // SELECT 列表与其它列槽
    | 'select_list.default'
    | 'select_list.after_comma'
    | 'select_list.after_aggregate'
    | 'select_list.after_item'
    | 'column_ref.default'
    | 'group_by.pick_column'
    | 'group_by.after_comma'
    | 'group_by.clause_next'
    | 'order_by.pick_column'
    | 'order_by.after_comma'
    | 'order_by.after_column'
    | 'order_by.clause_next'
    // DML
    | 'insert.values'
    | 'insert.columns'
    | 'insert.pick_column'
    | 'insert.after_table'
    | 'update.set'
    | 'update.pick_table'
    | 'update.after_table'
    | 'update.after_set_item'
    | 'delete.from'
    | 'delete.after_table'
    // 语句级
    | 'statement.start'
    | 'clause.keyword_first'
    | 'clause.column_first'
    | 'ddl.keywords'
    | 'ddl.pick_table'
    | 'ddl.after_table'
    | 'ddl.create_rest'
    | 'ddl.column_type'

export type TableInsertMode = 'with-alias' | 'name-only'

export type KeywordSlotOverride =
    | SqlCompletionSlot
    | 'after_table'
    | 'after_join_table'
    | 'after_on'
    | 'after_where'
    | 'after_group_by'
    | 'after_having'
    | 'after_order_by'
    | 'after_set'
    | 'after_alter_table'
    | 'select_aggregate'

/** 阶段计划模板 */
export interface StagePlanTemplate {
    collectors: CompletionCollector[]
    sortProfile: CompletionSortProfile
    keywordPhase: KeywordPhase
    keywordSlot?: KeywordSlotOverride
    suppressTables?: boolean
    columnMatch?: ColumnMatchMode
    /** 表名补全插入模式；默认跟随编辑器 autoTableAlias 设置 */
    tableInsertMode?: TableInsertMode
}

export interface SqlCompletionPlan {
    stage: CompletionStage
    collectors: CompletionCollector[]
    sortProfile: CompletionSortProfile
    keywordPhase: KeywordPhase
    keywordSlot: KeywordSlotOverride
    suppressTables: boolean
    columnMatch?: ColumnMatchMode
    tableInsertMode?: TableInsertMode
    parserKeywords?: string[]
}
