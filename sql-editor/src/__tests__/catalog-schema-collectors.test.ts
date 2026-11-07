import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    collectCatalogSchemaSuggestions,
    parseQualifiedTablePrefix,
} from '../completion/builders/catalog-schema-collectors.ts'
import {setSqlEditorSnippetLayers} from '../config/snippets/cache.ts'
import type {SqlCompletionContext} from '../../completion/context.ts'
import type {SqlEditorSchema} from '../../types.ts'

function ctx(overrides: Partial<SqlCompletionContext>): SqlCompletionContext {
    return {
        statement: 'select',
        slot: 'from',
        qualifier: null,
        aliases: {},
        resolvedTable: null,
        columnPrefix: null,
        signals: {} as SqlCompletionContext['signals'],
        fromJoin: {
            tablePrefix: '',
            resolvedTable: null,
            tableClauseComplete: false,
            aliasOnLineAfterCursor: null,
            awaitingTableName: true,
        },
        predicateSlot: null,
        segment: 'select * from ',
        ...overrides,
    }
}

describe('catalog-schema-collectors', () => {
    const schema: SqlEditorSchema = {
        tables: ['ds_data_receive_stat'],
        columns: {},
        catalogs: ['hive'],
        schemasByCatalog: {hive: ['a003_a']},
    }

    it('parseQualifiedTablePrefix handles trailing dot', () => {
        assert.deepEqual(parseQualifiedTablePrefix('hive.'), {
            parts: ['hive'],
            trailingDot: true,
        })
    })

    it('suggests catalogs after FROM', () => {
        const items: Array<{ insertText: string }> = []
        collectCatalogSchemaSuggestions(
            ctx({slot: 'from'}),
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            schema,
        )
        assert.deepEqual(items.map((item) => item.insertText), ['hive'])
    })

    it('suggests schemas after catalog dot', () => {
        const items: Array<{ insertText: string }> = []
        collectCatalogSchemaSuggestions(
            ctx({
                fromJoin: {
                    tablePrefix: 'hive.',
                    resolvedTable: null,
                    tableClauseComplete: false,
                    aliasOnLineAfterCursor: null,
                },
            }),
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            'hive.',
            schema,
        )
        assert.deepEqual(items.map((item) => item.insertText), ['a003_a'])
    })

    it('suggests tables after catalog.schema dot', () => {
        const schemaWithTables: SqlEditorSchema = {
            ...schema,
            tablesByDatabase: {
                'hive.a003_a': {
                    tables: ['t_recharge_detail1'],
                    tableIds: {t_recharge_detail1: 'id-1'},
                },
            },
        }
        const items: Array<{ insertText: string }> = []
        collectCatalogSchemaSuggestions(
            ctx({
                fromJoin: {
                    tablePrefix: 'hive.a003_a.',
                    resolvedTable: null,
                    tableClauseComplete: false,
                    aliasOnLineAfterCursor: null,
                },
            }),
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            schemaWithTables,
        )
        assert.deepEqual(items.map((item) => item.insertText), ['t_recharge_detail1'])
    })

    it('suggests MySQL tables after database dot', () => {
        const mysqlSchema: SqlEditorSchema = {
            tables: [],
            columns: {},
            catalogs: ['admin_db', 'mysql'],
            schemasByCatalog: {},
            tablesByDatabase: {
                admin_db: {
                    tables: ['users', 'orders'],
                    tableIds: {users: 'u1', orders: 'o1'},
                },
            },
        }
        const items: Array<{ insertText: string }> = []
        collectCatalogSchemaSuggestions(
            ctx({
                fromJoin: {
                    tablePrefix: 'admin_db.',
                    resolvedTable: null,
                    tableClauseComplete: false,
                    aliasOnLineAfterCursor: null,
                },
            }),
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            mysqlSchema,
        )
        assert.deepEqual(items.map((item) => item.insertText).sort(), ['orders', 'users'])
    })

    it('MySQL admin_db. table pick appends alias when editor context provided', () => {
        setSqlEditorSnippetLayers({
            pluginShared: {autoTableAlias: true},
            personal: {autoTableAlias: true},
        })
        const mysqlSchema: SqlEditorSchema = {
            tables: [],
            columns: {},
            catalogs: ['admin_db'],
            schemasByCatalog: {},
            tablesByDatabase: {
                admin_db: {
                    tables: ['cdp_tag'],
                    tableIds: {cdp_tag: 't1'},
                },
            },
        }
        const sql = 'SELECT * FROM admin_db.'
        const items: Array<{ insertText: string; command?: {id: string} }> = []
        collectCatalogSchemaSuggestions(
            ctx({
                fromJoin: {
                    tablePrefix: 'admin_db.',
                    resolvedTable: null,
                    tableClauseComplete: false,
                    aliasOnLineAfterCursor: null,
                    awaitingTableName: true,
                },
            }),
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: sql.length + 1, endColumn: sql.length + 1},
            '',
            mysqlSchema,
            {lineAtRange: sql, fullSql: sql, cursorOffset: sql.length, lineBeforeCursor: sql},
        )
        assert.equal(items.length, 1)
        assert.match(items[0]!.insertText, /^cdp_tag\s+\w+\s$/)
        assert.equal(items[0]!.command?.id, 'editor.action.triggerSuggest')
    })
})
