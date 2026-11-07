import type {SqlStatementKind} from '@sql-editor/types'
import type {CompletionStage} from '../types'
import {grammarRuleKey} from '../engine/iter-rules'

export type GrammarFixture = {
    sql: string
    stage: CompletionStage
    clauseId?: string | null
    /** 全局规则优先时与 rule.stateId 不同 */
    stateId?: string | null
    hasColumns?: boolean
    hasKeywords?: boolean
}

const FIXTURE_LIST: Array<{
    statement: SqlStatementKind
    clauseId: string | null
    stateId: string
    fixture: GrammarFixture
}> = [
    // ── SELECT global ──
    {
        statement: 'select', clauseId: null, stateId: 'global_after_select_list_complete_col',
        fixture: {
            sql: 'SELECT t1.id, t1.status| FROM orders t1',
            stage: 'select_list.after_item',
            clauseId: null,
            hasColumns: false,
            hasKeywords: true,
        },
    },
    {
        statement: 'select', clauseId: null, stateId: 'global_column_ref',
        fixture: {
            sql: 'SELECT * FROM cdp_tag ct LEFT JOIN cdp_segment cs ON ct.|',
            stage: 'column_ref.default',
            clauseId: null,
            hasColumns: true,
        },
    },
    {
        statement: 'select', clauseId: null, stateId: 'global_on_complete',
        fixture: {
            sql: 'SELECT * FROM cdp_tag ct LEFT JOIN cdp_segment cs ON ct.id = cs.tag_ids WH',
            stage: 'predicate.after_on_complete', clauseId: null,
        },
    },
    {
        statement: 'select', clauseId: null, stateId: 'global_where_complete',
        fixture: {sql: 'SELECT * FROM t WHERE 1=1 |', stage: 'predicate.after_where_complete', clauseId: null},
    },
    {
        statement: 'select', clauseId: null, stateId: 'global_having_complete',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status HAVING status = 1 |',
            stage: 'predicate.after_having_complete',
            clauseId: null,
        },
    },

    // ── SELECT select_list ──
    {
        statement: 'select', clauseId: 'select_list', stateId: 'aggregate_fn',
        fixture: {
            sql: 'SELECT status, COUNT| FROM orders',
            stage: 'select_list.after_aggregate',
            clauseId: 'select_list'
        },
    },
    {
        statement: 'select', clauseId: 'select_list', stateId: 'after_comma',
        fixture: {sql: 'SELECT status, | FROM orders', stage: 'select_list.after_comma', clauseId: 'select_list'},
    },
    {
        statement: 'select', clauseId: 'select_list', stateId: 'default',
        fixture: {sql: 'SELECT | FROM orders', stage: 'select_list.default', clauseId: 'select_list'},
    },

    // ── SELECT from ──
    {
        statement: 'select', clauseId: 'from', stateId: 'awaiting_on',
        fixture: {sql: 'SELECT * FROM orders o JOIN cdp_tag ct |', stage: 'join.on_keyword', clauseId: 'join'},
    },
    {
        statement: 'select', clauseId: 'from', stateId: 'table_complete',
        fixture: {sql: 'SELECT * FROM orders o |', stage: 'table.clause_next', clauseId: 'from'},
    },
    {
        statement: 'select', clauseId: 'from', stateId: 'pick_table',
        fixture: {sql: 'SELECT * FROM |', stage: 'table.pick', hasColumns: false, clauseId: 'from'},
    },

    // ── SELECT join ──
    {
        statement: 'select', clauseId: 'join', stateId: 'awaiting_on',
        fixture: {sql: 'SELECT * FROM orders o JOIN cdp_tag ct |', stage: 'join.on_keyword', clauseId: 'join'},
    },
    {
        statement: 'select', clauseId: 'join', stateId: 'table_complete',
        fixture: {sql: 'SELECT * FROM orders o LEFT |', stage: 'table.clause_next', clauseId: 'from'},
    },
    {
        statement: 'select', clauseId: 'join', stateId: 'await_table',
        fixture: {sql: 'SELECT * FROM orders o JOIN |', stage: 'join.await_table', hasColumns: false, clauseId: 'join'},
    },
    {
        statement: 'select', clauseId: 'join', stateId: 'pick_table',
        fixture: {sql: 'SELECT * FROM orders o JOIN cdp|', stage: 'table.pick', hasColumns: false, clauseId: 'join'},
    },

    // ── SELECT on ──
    {
        statement: 'select', clauseId: 'on', stateId: 'on_complete',
        fixture: {
            sql: 'SELECT * FROM orders o JOIN cdp_tag ct ON o.id = ct.id |',
            stage: 'predicate.after_on_complete', clauseId: null, stateId: 'global_on_complete',
        },
    },
    {
        statement: 'select', clauseId: 'on', stateId: 'on_pick_value',
        fixture: {
            sql: 'SELECT * FROM orders o JOIN cdp_tag ct ON o.id = |',
            stage: 'predicate.pick_value',
            clauseId: 'on'
        },
    },
    {
        statement: 'select', clauseId: 'on', stateId: 'on_after_column',
        fixture: {
            sql: 'SELECT * FROM orders o JOIN cdp_tag ct ON o.status |',
            stage: 'predicate.after_column',
            clauseId: 'on'
        },
    },
    {
        statement: 'select', clauseId: 'on', stateId: 'on_after_connector',
        fixture: {
            sql: 'SELECT * FROM orders o JOIN cdp_tag ct ON o.id = 1 AND |',
            stage: 'predicate.after_connector',
            clauseId: 'on'
        },
    },
    {
        statement: 'select', clauseId: 'on', stateId: 'pick_fk_column',
        fixture: {
            sql: 'SELECT * FROM orders o JOIN cdp_tag ct ON |',
            stage: 'predicate.pick_fk_on_column',
            clauseId: 'on'
        },
    },

    // ── SELECT where ──
    {
        statement: 'select', clauseId: 'where', stateId: 'where_complete',
        fixture: {
            sql: 'SELECT * FROM orders WHERE status = 1 |',
            stage: 'predicate.after_where_complete', clauseId: null, stateId: 'global_where_complete',
        },
    },
    {
        statement: 'select', clauseId: 'where', stateId: 'where_pick_value',
        fixture: {sql: 'SELECT * FROM orders WHERE status = |', stage: 'predicate.pick_value', clauseId: 'where'},
    },
    {
        statement: 'select', clauseId: 'where', stateId: 'where_after_column',
        fixture: {sql: 'SELECT * FROM orders WHERE status |', stage: 'predicate.after_column', clauseId: 'where'},
    },
    {
        statement: 'select', clauseId: 'where', stateId: 'where_after_connector',
        fixture: {
            sql: 'SELECT * FROM orders WHERE status = 1 AND |',
            stage: 'predicate.after_connector',
            clauseId: 'where'
        },
    },
    {
        statement: 'select', clauseId: 'where', stateId: 'pick_column',
        fixture: {
            sql: 'SELECT * FROM orders WHERE |',
            stage: 'predicate.pick_column',
            hasKeywords: false,
            clauseId: 'where'
        },
    },

    // ── SELECT group_by ──
    {
        statement: 'select', clauseId: 'group_by', stateId: 'clause_next',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status |',
            stage: 'group_by.clause_next',
            clauseId: 'group_by'
        },
    },
    {
        statement: 'select', clauseId: 'group_by', stateId: 'after_comma',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status, |',
            stage: 'group_by.after_comma',
            clauseId: 'group_by'
        },
    },
    {
        statement: 'select', clauseId: 'group_by', stateId: 'pick_column',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY |',
            stage: 'group_by.pick_column', hasKeywords: false, clauseId: 'group_by',
        },
    },

    // ── SELECT having ──
    {
        statement: 'select', clauseId: 'having', stateId: 'having_complete',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status HAVING status = 1 |',
            stage: 'predicate.after_having_complete',
            clauseId: null,
            stateId: 'global_having_complete',
        },
    },
    {
        statement: 'select', clauseId: 'having', stateId: 'having_pick_value',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status HAVING status = |',
            stage: 'predicate.pick_value',
            clauseId: 'having'
        },
    },
    {
        statement: 'select', clauseId: 'having', stateId: 'having_after_column',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status HAVING status |',
            stage: 'predicate.after_column',
            clauseId: 'having'
        },
    },
    {
        statement: 'select', clauseId: 'having', stateId: 'having_after_connector',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status HAVING status = 1 AND |',
            stage: 'predicate.after_connector',
            clauseId: 'having'
        },
    },
    {
        statement: 'select', clauseId: 'having', stateId: 'pick_column',
        fixture: {
            sql: 'SELECT status FROM orders GROUP BY status HAVING |',
            stage: 'predicate.pick_column',
            clauseId: 'having'
        },
    },

    // ── SELECT order_by ──
    {
        statement: 'select', clauseId: 'order_by', stateId: 'clause_next',
        fixture: {
            sql: 'SELECT status FROM orders ORDER BY status ASC |',
            stage: 'order_by.clause_next',
            clauseId: 'order_by',
            hasKeywords: true,
        },
    },
    {
        statement: 'select', clauseId: 'order_by', stateId: 'after_column',
        fixture: {
            sql: 'SELECT status FROM orders ORDER BY status |',
            stage: 'order_by.after_column',
            hasKeywords: true,
            clauseId: 'order_by',
        },
    },
    {
        statement: 'select', clauseId: 'order_by', stateId: 'after_comma',
        fixture: {
            sql: 'SELECT status FROM orders ORDER BY status, |',
            stage: 'order_by.after_comma',
            clauseId: 'order_by'
        },
    },
    {
        statement: 'select', clauseId: 'order_by', stateId: 'pick_column',
        fixture: {
            sql: 'SELECT status FROM orders ORDER BY |',
            stage: 'order_by.pick_column', hasKeywords: false, clauseId: 'order_by',
        },
    },

    // ── SELECT tail ──
    {
        statement: 'select', clauseId: 'tail', stateId: 'keyword_first',
        fixture: {sql: 'SELECT * FROM orders LIMIT |', stage: 'clause.keyword_first', clauseId: 'tail'},
    },
    {
        statement: 'select', clauseId: 'tail', stateId: 'default',
        fixture: {
            sql: 'SELECT * FROM orders LIMIT 10, |',
            stage: 'clause.column_first', clauseId: 'tail',
        },
    },

    // ── INSERT ──
    {
        statement: 'insert', clauseId: 'insert_columns', stateId: 'pick_table',
        fixture: {sql: 'INSERT INTO |', stage: 'insert.columns', clauseId: 'insert_columns'},
    },
    {
        statement: 'insert', clauseId: 'insert_columns', stateId: 'in_column_list',
        fixture: {sql: 'INSERT INTO orders (|', stage: 'insert.pick_column', clauseId: 'insert_columns'},
    },
    {
        statement: 'insert', clauseId: 'insert_columns', stateId: 'after_column_list',
        fixture: {
            sql: 'INSERT INTO orders (id, status) |',
            stage: 'insert.after_table',
            clauseId: 'insert_columns',
        },
    },
    {
        statement: 'insert', clauseId: 'insert_columns', stateId: 'table_complete',
        fixture: {sql: 'INSERT INTO orders |', stage: 'insert.after_table', clauseId: 'insert_columns'},
    },
    {
        statement: 'insert', clauseId: 'values', stateId: 'default',
        fixture: {sql: 'INSERT INTO orders VALUES (|', stage: 'insert.values', clauseId: 'values'},
    },

    // ── UPDATE ──
    {
        statement: 'update', clauseId: 'update_table', stateId: 'pick_table',
        fixture: {sql: 'UPDATE |', stage: 'update.pick_table', clauseId: 'update_table'},
    },
    {
        statement: 'update', clauseId: 'update_table', stateId: 'table_complete',
        fixture: {sql: 'UPDATE orders |', stage: 'update.after_table', clauseId: 'update_table'},
    },
    {
        statement: 'update', clauseId: null, stateId: 'global_where_complete',
        fixture: {
            sql: 'UPDATE orders SET status = 1 WHERE id = 1 |',
            stage: 'predicate.after_where_complete',
            clauseId: null
        },
    },
    {
        statement: 'update', clauseId: 'set', stateId: 'set_pick_value',
        fixture: {sql: 'UPDATE orders SET status = |', stage: 'predicate.pick_value', clauseId: 'set'},
    },
    {
        statement: 'update', clauseId: 'set', stateId: 'after_set_item',
        fixture: {
            sql: 'UPDATE orders SET status = 1 |',
            stage: 'update.after_set_item',
            clauseId: 'set',
        },
    },
    {
        statement: 'update', clauseId: 'set', stateId: 'set_after_column',
        fixture: {sql: 'UPDATE orders SET id = 1, status |', stage: 'predicate.after_column', clauseId: 'set'},
    },
    {
        statement: 'update', clauseId: 'set', stateId: 'pick_column',
        fixture: {sql: 'UPDATE orders SET |', stage: 'update.set', clauseId: 'set'},
    },
    {
        statement: 'update', clauseId: 'where', stateId: 'where_complete',
        fixture: {
            sql: 'UPDATE orders SET status = 1 WHERE id = 1 |',
            stage: 'predicate.after_where_complete', clauseId: null, stateId: 'global_where_complete',
        },
    },
    {
        statement: 'update', clauseId: 'where', stateId: 'where_pick_value',
        fixture: {sql: 'UPDATE orders SET status = 1 WHERE id = |', stage: 'predicate.pick_value', clauseId: 'where'},
    },
    {
        statement: 'update', clauseId: 'where', stateId: 'where_after_column',
        fixture: {sql: 'UPDATE orders SET status = 1 WHERE id |', stage: 'predicate.after_column', clauseId: 'where'},
    },
    {
        statement: 'update', clauseId: 'where', stateId: 'where_after_connector',
        fixture: {
            sql: 'UPDATE orders SET status = 1 WHERE id = 1 AND |',
            stage: 'predicate.after_connector',
            clauseId: 'where'
        },
    },
    {
        statement: 'update', clauseId: 'where', stateId: 'pick_column',
        fixture: {sql: 'UPDATE orders SET status = 1 WHERE |', stage: 'predicate.pick_column', clauseId: 'where'},
    },

    // ── DELETE ──
    {
        statement: 'delete', clauseId: null, stateId: 'global_where_complete',
        fixture: {sql: 'DELETE FROM orders WHERE id = 1 |', stage: 'predicate.after_where_complete', clauseId: null},
    },
    {
        statement: 'delete', clauseId: 'from', stateId: 'pick_table',
        fixture: {sql: 'DELETE FROM |', stage: 'delete.from', clauseId: 'from'},
    },
    {
        statement: 'delete', clauseId: 'from', stateId: 'table_complete',
        fixture: {sql: 'DELETE FROM orders |', stage: 'delete.after_table', clauseId: 'from'},
    },
    {
        statement: 'delete', clauseId: 'where', stateId: 'where_complete',
        fixture: {
            sql: 'DELETE FROM orders WHERE id = 1 |',
            stage: 'predicate.after_where_complete', clauseId: null, stateId: 'global_where_complete',
        },
    },
    {
        statement: 'delete', clauseId: 'where', stateId: 'where_pick_value',
        fixture: {sql: 'DELETE FROM orders WHERE id = |', stage: 'predicate.pick_value', clauseId: 'where'},
    },
    {
        statement: 'delete', clauseId: 'where', stateId: 'where_after_column',
        fixture: {sql: 'DELETE FROM orders WHERE id |', stage: 'predicate.after_column', clauseId: 'where'},
    },
    {
        statement: 'delete', clauseId: 'where', stateId: 'where_after_connector',
        fixture: {sql: 'DELETE FROM orders WHERE id = 1 AND |', stage: 'predicate.after_connector', clauseId: 'where'},
    },
    {
        statement: 'delete', clauseId: 'where', stateId: 'pick_column',
        fixture: {sql: 'DELETE FROM orders WHERE |', stage: 'predicate.pick_column', clauseId: 'where'},
    },

    // ── EMPTY / DDL / UNKNOWN ──
    {
        statement: 'empty', clauseId: 'start', stateId: 'default',
        fixture: {sql: '|', stage: 'statement.start', clauseId: 'start'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_start', stateId: 'default',
        fixture: {sql: 'CREATE |', stage: 'ddl.keywords', clauseId: 'ddl_start'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_table_object', stateId: 'pick_table',
        fixture: {sql: 'DROP TABLE IF EXISTS |', stage: 'ddl.pick_table', clauseId: 'ddl_table_object'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_table_object', stateId: 'after_table',
        fixture: {sql: 'ALTER TABLE users |', stage: 'ddl.after_table', clauseId: 'ddl_table_object'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_create_body', stateId: 'column_type',
        fixture: {sql: 'CREATE TABLE users (\n  id |', stage: 'ddl.column_type', clauseId: 'ddl_create_body'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_create_body', stateId: 'create_rest',
        fixture: {sql: 'CREATE TABLE users |', stage: 'ddl.create_rest', clauseId: 'ddl_create_body'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_column_type', stateId: 'before_type',
        fixture: {sql: 'ALTER TABLE users ADD COLUMN |', stage: 'ddl.create_rest', clauseId: 'ddl_column_type'},
    },
    {
        statement: 'ddl', clauseId: 'ddl_column_type', stateId: 'column_type',
        fixture: {sql: 'ALTER TABLE users ADD COLUMN name |', stage: 'ddl.column_type', clauseId: 'ddl_column_type'},
    },
    {
        statement: 'unknown', clauseId: 'start', stateId: 'default',
        fixture: {sql: 'PRAGMA |', stage: 'statement.start', clauseId: 'start'},
    },
]

export const GRAMMAR_FIXTURES: Readonly<Record<string, GrammarFixture>> = Object.fromEntries(
    FIXTURE_LIST.map(({statement, clauseId, stateId, fixture}) => [
        grammarRuleKey(statement, clauseId, stateId),
        fixture,
    ]),
)

export function getGrammarFixture(
    statement: SqlStatementKind,
    clauseId: string | null,
    stateId: string,
): GrammarFixture | undefined {
    return GRAMMAR_FIXTURES[grammarRuleKey(statement, clauseId, stateId)]
}
