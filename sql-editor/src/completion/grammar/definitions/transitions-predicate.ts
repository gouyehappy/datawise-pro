import type {TransitionId} from './types'

/** ON / WHERE / HAVING / SET 谓词链 — 共用状态表 */
export const PREDICATE_CHAIN_STATES = {
    onComplete: {
        id: 'on_clause_complete',
        when: 'after_complete_on_predicate' as TransitionId,
        stage: 'predicate.after_on_complete' as const,
        hint: 'ON 条件完整 → WHERE / JOIN 关键字',
    },
    whereComplete: {
        id: 'where_clause_complete',
        when: 'after_complete_where_predicate' as TransitionId,
        stage: 'predicate.after_where_complete' as const,
        hint: 'WHERE 条件完整 → AND/OR / GROUP BY / ORDER BY',
    },
    pickValue: {
        id: 'pick_predicate_value',
        when: 'after_predicate_operator' as TransitionId,
        stage: 'predicate.pick_value' as const,
        hint: '= / LIKE 后 → 填值或枚举',
    },
    afterColumn: {
        id: 'after_column_ref',
        when: 'after_complete_column_ref' as TransitionId,
        stage: 'predicate.after_column' as const,
        hint: '列名完整 → 运算符 = <> LIKE …',
    },
    afterConnector: {
        id: 'after_and_or',
        when: 'after_condition_connector' as TransitionId,
        stage: 'predicate.after_connector' as const,
        hint: 'AND/OR 后 → 下一条件列',
    },
} as const
