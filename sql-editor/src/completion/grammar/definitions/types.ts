import type {SqlCompletionSlot, SqlStatementKind} from '@sql-editor/types'
import type {CompletionStage} from '../types'

/**
 * 语法状态转移条件 — 与具体检测函数一一对应。
 * 新增补全位置：先加 TransitionId，再在 definitions 里引用。
 */
export type TransitionId =
    | 'always'
    | 'column_ref'
    | 'after_comma'
    | 'after_select_aggregate'
    | 'after_complete_on_predicate'
    | 'after_complete_where_predicate'
    | 'after_complete_group_by_list'
    | 'after_complete_order_by'
    | 'after_complete_having_predicate'
    | 'after_predicate_operator'
    | 'after_complete_column_ref'
    | 'after_condition_connector'
    | 'order_by_after_column'
    | 'after_select_list_item'
    | 'after_select_list_complete_col'
    | 'from_awaiting_on_clause'
    | 'from_table_clause_complete'
    | 'from_awaiting_table_name'
    | 'from_awaiting_join_table'
    | 'keyword_first_slot'
    | 'ddl_awaiting_column_type'
    | 'ddl_after_alter_table'
    | 'insert_in_column_list'
    | 'after_insert_column_list'
    | 'after_complete_set_assignment'

/** 单条语法状态：满足 when → 进入 stage，显示内容由 plans.ts 定义 */
export interface GrammarStateRule {
    id: string
    when: TransitionId
    stage: CompletionStage
    /** 文档 / 测试用：该位置应提示什么 */
    hint: string
}

/** SQL 子句（SELECT / FROM / WHERE …） */
export interface GrammarClause {
    id: string
    slot: SqlCompletionSlot
    /** 子句起始关键字（长关键字在前，如 LEFT JOIN 先于 JOIN） */
    markers: readonly string[]
    states: readonly GrammarStateRule[]
}

/** 完整语句语法图 */
export interface StatementGrammar {
    statement: SqlStatementKind
    /** 跨子句优先规则（ON/WHERE 完整后接下一子句等） */
    globalRules: readonly GrammarStateRule[]
    clauses: readonly GrammarClause[]
    fallback: CompletionStage
}

export interface GrammarResolution {
    stage: CompletionStage
    clauseId: string | null
    stateId: string | null
    hint: string | null
}
