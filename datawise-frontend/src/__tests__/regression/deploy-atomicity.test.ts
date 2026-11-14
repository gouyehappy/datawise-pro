import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    classifyDeployAtomicity,
    classifyStructureDeployAtomicity,
    resolveDeployOutcome,
} from '@/features/schema-compare/services/deploy-atomicity.service'

describe('deploy atomicity (T-SCHEMA-1)', () => {
    it('marks mysql DDL as partial', () => {
        assert.equal(
            classifyDeployAtomicity({sql: 'ALTER TABLE t ADD COLUMN c INT', dbType: 'mysql'}),
            'partial_effects_possible',
        )
    })

    it('marks postgresql DDL as guaranteed', () => {
        assert.equal(
            classifyDeployAtomicity({sql: 'ALTER TABLE t ADD COLUMN c INT', dbType: 'postgresql'}),
            'guaranteed_rollback',
        )
    })

    it('marks DML-only as guaranteed', () => {
        assert.equal(
            classifyDeployAtomicity({sql: 'UPDATE t SET a=1', dbType: 'mysql'}),
            'guaranteed_rollback',
        )
    })

    it('classifies create-missing structure path by dialect', () => {
        assert.equal(
            classifyStructureDeployAtomicity({dbType: 'mysql', includesDdl: true}),
            'partial_effects_possible',
        )
        assert.equal(
            classifyStructureDeployAtomicity({dbType: 'postgresql', includesDdl: true}),
            'guaranteed_rollback',
        )
        assert.equal(
            classifyStructureDeployAtomicity({dbType: 'mysql', includesDdl: false}),
            null,
        )
    })

    it('maps mixed outcome for partial failures', () => {
        assert.equal(
            resolveDeployOutcome({
                atomicity: 'partial_effects_possible',
                ok: false,
                executedCount: 2,
                totalStatements: 5,
            }),
            'mixed',
        )
        assert.equal(
            resolveDeployOutcome({
                atomicity: 'guaranteed_rollback',
                ok: false,
                executedCount: 2,
                totalStatements: 5,
            }),
            'rolled_back',
        )
    })
})
