import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'

describe('execute-alter-column batch split', () => {
    it('keeps a single alter statement as one batch item', () => {
        const sql = 'ALTER TABLE `shop`.`orders` ADD COLUMN `note` VARCHAR(64);'
        const batch = resolveRunSqlBatch(sql)
        assert.equal(batch.length, 1)
        assert.match(batch[0]!, /ADD COLUMN/)
    })

    it('splits postgresql multi-statement alter scripts', () => {
        const sql = [
            'ALTER TABLE "shop"."orders" ALTER COLUMN "note" TYPE varchar(64);',
            'ALTER TABLE "shop"."orders" ALTER COLUMN "note" DROP NOT NULL;',
            'ALTER TABLE "shop"."orders" ALTER COLUMN "note" DROP DEFAULT;',
        ].join('\n')
        const batch = resolveRunSqlBatch(sql)
        assert.equal(batch.length, 3)
        assert.match(batch[0]!, /TYPE varchar\(64\)/)
        assert.match(batch[2]!, /DROP DEFAULT/)
    })
})
