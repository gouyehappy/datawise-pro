import type {StatementGrammar} from './types'
import {PREDICATE_CHAIN_STATES} from './transitions'

const P = PREDICATE_CHAIN_STATES

/**
 * SELECT 语句完整语法图
 *
 * 子句顺序（SQL 书写顺序）：
 *   SELECT → FROM → [JOIN … ON …]* → [WHERE] → [GROUP BY] → [HAVING] → [ORDER BY] → [LIMIT]
 *
 * 每个子句内 states 按数组顺序匹配，首个 when 为 true 的生效。
 */
export const SELECT_STATEMENT_GRAMMAR: StatementGrammar = {
    statement: 'select',
    fallback: 'clause.column_first',

    globalRules: [
        {
            id: 'global_after_select_list_complete_col',
            when: 'after_select_list_complete_col',
            stage: 'select_list.after_item',
            hint: 'SELECT 列表完整 alias.col → AS / FROM，不再推字段',
        },
        {
            id: 'global_column_ref',
            when: 'column_ref',
            stage: 'column_ref.default',
            hint: 'alias. 后 → 该表列名（allow-empty）',
        },
        {
            id: 'global_on_complete',
            when: 'after_complete_on_predicate',
            stage: 'predicate.after_on_complete',
            hint: P.onComplete.hint,
        },
        {
            id: 'global_having_complete',
            when: 'after_complete_having_predicate',
            stage: 'predicate.after_having_complete',
            hint: 'HAVING 条件完整 → ORDER BY / LIMIT',
        },
        {
            id: 'global_where_complete',
            when: 'after_complete_where_predicate',
            stage: 'predicate.after_where_complete',
            hint: P.whereComplete.hint,
        },
    ],

    clauses: [
        {
            id: 'select_list',
            slot: 'select_list',
            markers: ['SELECT'],
            states: [
                {
                    id: 'aggregate_fn',
                    when: 'after_select_aggregate',
                    stage: 'select_list.after_aggregate',
                    hint: 'COUNT/SUM 后 → 仅 (',
                },
                {
                    id: 'after_comma',
                    when: 'after_comma',
                    stage: 'select_list.after_comma',
                    hint: '逗号后 → SELECT 列 / 表达式',
                },
                {
                    id: 'default',
                    when: 'always',
                    stage: 'select_list.default',
                    hint: 'SELECT 后 → 列 / 关键字 / 片段',
                },
            ],
        },
        {
            id: 'from',
            slot: 'from',
            markers: ['FROM'],
            states: [
                {
                    id: 'awaiting_on',
                    when: 'from_awaiting_on_clause',
                    stage: 'join.on_keyword',
                    hint: 'JOIN 右表+别名后 → 仅 ON',
                },
                {
                    id: 'table_complete',
                    when: 'from_table_clause_complete',
                    stage: 'table.clause_next',
                    hint: '表+别名后 → WHERE / JOIN',
                },
                {
                    id: 'pick_table',
                    when: 'always',
                    stage: 'table.pick',
                    hint: 'FROM 后 → 表名 / FK JOIN 行',
                },
            ],
        },
        {
            id: 'join',
            slot: 'join',
            markers: ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN'],
            states: [
                {
                    id: 'awaiting_on',
                    when: 'from_awaiting_on_clause',
                    stage: 'join.on_keyword',
                    hint: 'JOIN 右表+别名后 → 仅 ON',
                },
                {
                    id: 'table_complete',
                    when: 'from_table_clause_complete',
                    stage: 'table.clause_next',
                    hint: 'JOIN 表+别名后 → ON',
                },
                {
                    id: 'await_table',
                    when: 'from_awaiting_join_table',
                    stage: 'join.await_table',
                    hint: 'JOIN 关键字后 → 仅右表名',
                },
                {
                    id: 'pick_table',
                    when: 'always',
                    stage: 'table.pick',
                    hint: 'JOIN 后 → 右表名 / FK 一行 JOIN',
                },
            ],
        },
        {
            id: 'on',
            slot: 'on',
            markers: ['ON'],
            states: [
                {...P.onComplete, id: 'on_complete'},
                {...P.pickValue, id: 'on_pick_value'},
                {...P.afterColumn, id: 'on_after_column'},
                {...P.afterConnector, id: 'on_after_connector'},
                {
                    id: 'pick_fk_column',
                    when: 'always',
                    stage: 'predicate.pick_fk_on_column',
                    hint: 'ON 后 → FK 等值列 / 列名（无运算符关键字）',
                },
            ],
        },
        {
            id: 'where',
            slot: 'where',
            markers: ['WHERE'],
            states: [
                {...P.whereComplete, id: 'where_complete'},
                {...P.pickValue, id: 'where_pick_value'},
                {...P.afterColumn, id: 'where_after_column'},
                {...P.afterConnector, id: 'where_after_connector'},
                {
                    id: 'pick_column',
                    when: 'always',
                    stage: 'predicate.pick_column',
                    hint: 'WHERE 后 → 列名（无 ORDER BY 等）',
                },
            ],
        },
        {
            id: 'group_by',
            slot: 'group_by',
            markers: ['GROUP BY'],
            states: [
                {
                    id: 'clause_next',
                    when: 'after_complete_group_by_list',
                    stage: 'group_by.clause_next',
                    hint: 'GROUP BY 列表完整 → ORDER BY / HAVING / LIMIT',
                },
                {
                    id: 'after_comma',
                    when: 'after_comma',
                    stage: 'group_by.after_comma',
                    hint: 'GROUP BY 逗号后 → 继续选分组列',
                },
                {
                    id: 'pick_column',
                    when: 'always',
                    stage: 'group_by.pick_column',
                    hint: 'GROUP BY 后 → 仅 SELECT 非聚合列',
                },
            ],
        },
        {
            id: 'having',
            slot: 'having',
            markers: ['HAVING'],
            states: [
                {
                    id: 'having_complete',
                    when: 'after_complete_having_predicate',
                    stage: 'predicate.after_having_complete',
                    hint: 'HAVING 条件完整 → ORDER BY / LIMIT',
                },
                {...P.pickValue, id: 'having_pick_value'},
                {...P.afterColumn, id: 'having_after_column'},
                {...P.afterConnector, id: 'having_after_connector'},
                {
                    id: 'pick_column',
                    when: 'always',
                    stage: 'predicate.pick_column',
                    hint: 'HAVING 后 → 聚合列 / 表达式',
                },
            ],
        },
        {
            id: 'order_by',
            slot: 'order_by',
            markers: ['ORDER BY'],
            states: [
                {
                    id: 'clause_next',
                    when: 'after_complete_order_by',
                    stage: 'order_by.clause_next',
                    hint: 'ORDER BY ASC/DESC 后 → LIMIT / OFFSET',
                },
                {
                    id: 'after_column',
                    when: 'order_by_after_column',
                    stage: 'order_by.after_column',
                    hint: 'ORDER BY 列完整 → ASC / DESC',
                },
                {
                    id: 'after_comma',
                    when: 'after_comma',
                    stage: 'order_by.after_comma',
                    hint: 'ORDER BY 逗号后 → 继续选排序列',
                },
                {
                    id: 'pick_column',
                    when: 'always',
                    stage: 'order_by.pick_column',
                    hint: 'ORDER BY 后 → 仅排序列 / 序号',
                },
            ],
        },
        {
            id: 'tail',
            slot: 'tail',
            markers: ['LIMIT', 'OFFSET'],
            states: [
                {
                    id: 'keyword_first',
                    when: 'keyword_first_slot',
                    stage: 'clause.keyword_first',
                    hint: 'LIMIT/OFFSET 区域 → 关键字优先',
                },
                {
                    id: 'default',
                    when: 'always',
                    stage: 'clause.column_first',
                    hint: '尾部子句 → 值 / 关键字',
                },
            ],
        },
    ],
}
