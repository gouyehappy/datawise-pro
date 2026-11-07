import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildMigrationRequest} from '../commands/migrate-run.js'
import {migrationExitCode} from '../format.js'

describe('migrate run', () => {
    it('builds batch request from CLI options', () => {
        const request = buildMigrationRequest({
            source: 'conn-src',
            sourceDb: 'shop',
            target: 'conn-dst',
            targetDb: 'shop',
            tables: 'users, orders',
            where: 'id > 0',
            batchSize: '500',
            truncate: true,
            createMissing: true,
        })
        assert.equal(request.sourceConnectionId, 'conn-src')
        assert.equal(request.sourceDatabase, 'shop')
        assert.equal(request.targetConnectionId, 'conn-dst')
        assert.equal(request.batchSize, 500)
        assert.equal(request.truncateTarget, true)
        assert.deepEqual(request.tables, [
            {tableName: 'users', createTargetIfMissing: true},
            {tableName: 'orders', createTargetIfMissing: true},
        ])
    })

    it('maps overall status to exit code', () => {
        assert.equal(migrationExitCode('success'), 0)
        assert.equal(migrationExitCode('partial'), 1)
        assert.equal(migrationExitCode('failed'), 1)
    })
})
