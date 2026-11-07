import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    parseTrinoCatalogSchemaFromSql,
    resolveConsoleWorkspaceInstance,
    TRINO_CONNECTION_SCRIPTS_INSTANCE,
} from '../../features/workspace/services/console-workspace-instance.ts'

describe('console-workspace-instance', () => {
    it('parses catalog.schema from three-part qualified name', () => {
        assert.equal(
            parseTrinoCatalogSchemaFromSql('SELECT * FROM kudu.a003.hh_15'),
            'kudu.a003',
        )
    })

    it('prefers bound catalog.schema over sql', () => {
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'trino',
                sql: 'SELECT 1',
                tabDatabase: 'hive.a003',
                tree: [],
                connectionId: 'conn-1',
            }),
            'hive.a003',
        )
    })

    it('infers catalog.schema from sql when tab only has catalog', () => {
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'trino',
                sql: 'SELECT * FROM kudu.a003.hh_15',
                tabDatabase: 'kudu',
                tree: [],
                connectionId: 'conn-1',
            }),
            'kudu.a003',
        )
    })

    it('uses connection scripts folder when no schema context', () => {
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'trino',
                sql: 'SELECT 1',
                tabDatabase: 'kudu',
                tree: [],
                connectionId: 'conn-1',
            }),
            TRINO_CONNECTION_SCRIPTS_INSTANCE,
        )
    })

    it('keeps mysql database label unchanged', () => {
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'mysql',
                sql: 'SELECT 1',
                tabDatabase: 'admin_db',
                tree: [],
                connectionId: 'conn-1',
            }),
            'admin_db',
        )
    })
})
