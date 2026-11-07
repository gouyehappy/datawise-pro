import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    buildSqlExportOptions,
    countTablesUnderDatabase,
    createDefaultSqlExportWizardForm,
    resolveSqlExportWizardMessageKey,
    validateSqlExportWizardForm,
} from '@/features/explorer/services/sql-export-wizard.service'

describe('sql-export-wizard.service', () => {
    it('buildSqlExportOptions maps content mode and max rows', () => {
        assert.deepEqual(buildSqlExportOptions(createDefaultSqlExportWizardForm(500)), {
            includeData: false,
            maxRows: undefined,
        })
        assert.deepEqual(
            buildSqlExportOptions({
                contentMode: 'structureAndData',
                maxRows: 1000,
                output: 'download',
            }),
            {includeData: true, maxRows: 1000},
        )
        assert.deepEqual(
            buildSqlExportOptions({
                contentMode: 'structureAndData',
                maxRows: 0,
                output: 'download',
            }),
            {includeData: true, maxRows: undefined},
        )
    })

    it('validateSqlExportWizardForm rejects negative max rows', () => {
        assert.equal(validateSqlExportWizardForm(createDefaultSqlExportWizardForm(500)), null)
        assert.equal(
            validateSqlExportWizardForm({
                contentMode: 'structureAndData',
                maxRows: -1,
                output: 'download',
            }),
            'invalidMaxRows',
        )
    })

    it('countTablesUnderDatabase walks nested folders', () => {
        const tree: TreeNode[] = [
            {
                id: 'db1',
                label: 'app',
                type: 'database',
                children: [
                    {
                        id: 'folder',
                        label: 'public',
                        type: 'folder',
                        children: [
                            {id: 't1', label: 'users', type: 'table'},
                            {id: 't2', label: 'orders', type: 'table'},
                        ],
                    },
                    {id: 't3', label: 'logs', type: 'table'},
                ],
            },
        ]
        assert.equal(countTablesUnderDatabase(tree, 'db1'), 3)
    })

    it('resolveSqlExportWizardMessageKey maps export vs backup outcomes', () => {
        assert.equal(resolveSqlExportWizardMessageKey('export', 'success'), 'explorer.exportSqlSuccess')
        assert.equal(resolveSqlExportWizardMessageKey('export', 'copied'), 'explorer.exportSqlCopied')
        assert.equal(resolveSqlExportWizardMessageKey('export', 'failed'), 'explorer.exportSqlFailed')
        assert.equal(resolveSqlExportWizardMessageKey('backup', 'success'), 'explorer.backupWizard.success')
        assert.equal(resolveSqlExportWizardMessageKey('backup', 'copied'), 'explorer.backupWizard.copied')
        assert.equal(resolveSqlExportWizardMessageKey('backup', 'failed'), 'explorer.backupWizard.failed')
    })
})
