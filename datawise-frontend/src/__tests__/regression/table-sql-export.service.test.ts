import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    includeDataForExportAction,
    resolveExplorerSqlExportContext,
    resolveSqlClipboardExportMessageKey,
    shouldDownloadExportAction,
} from '@/features/explorer/services/table-sql-export.service'
import type {TreeNode} from '@/core/types'
import {API_PATHS} from '@/shared/api/http/paths'

const tree: TreeNode[] = [
    {
        id: 'conn-1',
        label: 'Local MySQL',
        type: 'connection',
        children: [
            {
                id: 'db-1',
                label: 'admin_db',
                type: 'database',
                children: [
                    {
                        id: 'table-1',
                        label: 'users',
                        type: 'table',
                    },
                ],
            },
        ],
    },
]

describe('table-sql-export.service', () => {
    it('resolves table export context from tree', () => {
        const tableNode = tree[0].children![0].children![0]
        assert.deepEqual(resolveExplorerSqlExportContext(tree, tableNode), {
            connectionId: 'conn-1',
            database: 'admin_db',
            tableName: 'users',
        })
    })

    it('resolves database export context from tree', () => {
        const databaseNode = tree[0].children![0]
        assert.deepEqual(resolveExplorerSqlExportContext(tree, databaseNode), {
            connectionId: 'conn-1',
            database: 'admin_db',
        })
    })

    it('maps menu actions to includeData and download mode', () => {
        assert.equal(includeDataForExportAction('export-structure'), false)
        assert.equal(includeDataForExportAction('export-all'), true)
        assert.equal(includeDataForExportAction('copy-structure'), false)
        assert.equal(includeDataForExportAction('copy-data'), true)

        assert.equal(shouldDownloadExportAction('export-structure'), true)
        assert.equal(shouldDownloadExportAction('copy-data'), false)
    })

    it('resolveSqlClipboardExportMessageKey maps toast keys', () => {
        assert.equal(resolveSqlClipboardExportMessageKey('contextMissing'), 'explorer.exportSqlContextMissing')
        assert.equal(resolveSqlClipboardExportMessageKey('success'), 'explorer.exportSqlSuccess')
        assert.equal(resolveSqlClipboardExportMessageKey('copied'), 'explorer.exportSqlCopied')
        assert.equal(resolveSqlClipboardExportMessageKey('failed'), 'explorer.exportSqlFailed')
    })

    it('builds export-sql API paths', () => {
        const options = {connectionId: 'conn-1', database: 'admin_db'}
        assert.equal(
            API_PATHS.tableExportSql('users', options),
            '/api/tables/users/export-sql?connectionId=conn-1&database=admin_db',
        )
        assert.equal(
            API_PATHS.tableExportSql('users', {...options, includeData: true}),
            '/api/tables/users/export-sql?connectionId=conn-1&database=admin_db&includeData=true',
        )
        assert.equal(
            API_PATHS.databaseExportSql({...options, includeData: true}),
            '/api/export-sql/database?connectionId=conn-1&database=admin_db&includeData=true',
        )
    })
})
