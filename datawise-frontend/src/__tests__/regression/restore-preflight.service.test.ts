import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    analyzeRestoreSqlPreflight,
    restoreNeedsDdlPermission,
    restoreNeedsWritePermission,
} from '@/features/explorer/services/restore-preflight.service'
import {createDefaultBackupWizardForm} from '@/features/explorer/services/sql-export-wizard.service'

describe('restore-preflight.service', () => {
    it('classifies read-only scripts as low risk', () => {
        const summary = analyzeRestoreSqlPreflight(
            'SELECT 1;\nSHOW TABLES;',
            'safe.sql',
        )
        assert.ok(summary)
        assert.equal(summary.statementCount, 2)
        assert.equal(summary.writeCount, 0)
        assert.equal(summary.riskLevel, 'low')
        assert.ok(summary.hintKeys.includes('readOnly'))
        assert.equal(restoreNeedsWritePermission(summary), false)
        assert.equal(restoreNeedsDdlPermission(summary), false)
    })

    it('flags DROP and full-table danger as high risk', () => {
        const summary = analyzeRestoreSqlPreflight(
            'DROP TABLE IF EXISTS orders;\nDELETE FROM staging;',
            'risky.sql',
        )
        assert.ok(summary)
        assert.ok(summary.dropCount >= 1)
        assert.equal(summary.riskLevel, 'high')
        assert.ok(summary.hintKeys.includes('hasDrop'))
        assert.ok(restoreNeedsDdlPermission(summary))
        assert.ok(restoreNeedsWritePermission(summary))
    })

    it('counts DDL and writes for medium risk inserts', () => {
        const summary = analyzeRestoreSqlPreflight(
            'CREATE TABLE t (id INT);\nINSERT INTO t VALUES (1);',
            'mid.sql',
        )
        assert.ok(summary)
        assert.ok(summary.ddlCount >= 1)
        assert.ok(summary.writeCount >= 1)
        assert.equal(summary.riskLevel, 'medium')
    })
})

describe('backup wizard defaults', () => {
    it('defaults to structure+data download', () => {
        const form = createDefaultBackupWizardForm(500)
        assert.equal(form.contentMode, 'structureAndData')
        assert.equal(form.output, 'download')
        assert.equal(form.maxRows, 500)
    })
})
