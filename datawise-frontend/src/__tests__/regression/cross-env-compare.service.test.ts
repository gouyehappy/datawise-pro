import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildCrossEnvResultLabel,
    clampCrossEnvSampleRowCount,
    CROSS_ENV_COMPARE_SAMPLE_MAX,
    resolveInitialCrossEnvCompareStep,
    scopesReadyForCompare,
    crossEnvCompareTabStateKey,
    validateCrossEnvCompareSql,
} from '@/features/cross-env-compare/services/cross-env-compare.service'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'

const leftScope: SchemaScope = {
    connectionId: 'conn-a',
    connectionLabel: 'MySQL Dev',
    database: 'shop',
    dbType: 'mysql',
}

const rightScope: SchemaScope = {
    connectionId: 'conn-b',
    connectionLabel: 'MySQL Prod',
    database: 'shop',
    dbType: 'mysql',
}

describe('cross-env-compare.service', () => {
    it('clamps sample row count', () => {
        assert.equal(clampCrossEnvSampleRowCount(0), 1)
        assert.equal(clampCrossEnvSampleRowCount(9999), CROSS_ENV_COMPARE_SAMPLE_MAX)
        assert.equal(clampCrossEnvSampleRowCount(25.4), 25)
    })

    it('rejects empty or write SQL', () => {
        assert.equal(validateCrossEnvCompareSql('   '), 'sqlRequired')
        assert.equal(validateCrossEnvCompareSql('DELETE FROM users'), 'readOnlySql')
        assert.equal(validateCrossEnvCompareSql('SELECT 1'), null)
    })

    it('requires different scopes', () => {
        assert.equal(scopesReadyForCompare(leftScope, rightScope), true)
        assert.equal(scopesReadyForCompare(leftScope, {...leftScope}), false)
    })

    it('builds labels with environment prefix', () => {
        const label = buildCrossEnvResultLabel(leftScope, {env: 'dev'})
        assert.match(label, /MySQL Dev/)
        assert.match(label, /shop/)
    })

    it('resolves wizard start step from saved tab state', () => {
        assert.equal(resolveInitialCrossEnvCompareStep({}), 'baseline')
        assert.equal(resolveInitialCrossEnvCompareStep({left: leftScope}), 'target')
        assert.equal(
            resolveInitialCrossEnvCompareStep({left: leftScope, right: rightScope}),
            'query',
        )
        assert.equal(
            resolveInitialCrossEnvCompareStep({
                left: leftScope,
                right: rightScope,
                sql: 'SELECT 1',
            }),
            'query',
        )
    })

    it('serializes tab state for external sync', () => {
        assert.equal(
            crossEnvCompareTabStateKey({left: leftScope, sql: 'SELECT 1'}),
            'conn-a:shop||SELECT 1',
        )
    })
})
