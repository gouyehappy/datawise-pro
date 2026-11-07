import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {ExecuteSqlResult} from '@/shared/api/types'
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

function mockLocalStorage() {
    Object.defineProperty(globalThis, 'localStorage', {
        value: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
        },
        configurable: true,
    })
}

describe('cross-env-compare.actions', () => {
    it('diffs sampled rows from both sides', async () => {
        mockLocalStorage()
        const {executeCrossEnvSampleCompare} = await import('@/features/cross-env-compare/services/cross-env-compare.actions')

        const execute = async (_sql: string, options?: {connectionId?: string}): Promise<ExecuteSqlResult> => {
            const rows =
                options?.connectionId === 'conn-a'
                    ? [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}]
                    : [{id: 1, name: 'Alice'}, {id: 2, name: 'Bobby'}]
            return {
                sql: 'SELECT id, name FROM users',
                columns: [{name: 'id', key: 'id'}, {name: 'name', key: 'name'}],
                rows,
                rowCount: rows.length,
                durationMs: 3,
            }
        }

        const result = await executeCrossEnvSampleCompare({
            left: leftScope,
            right: rightScope,
            leftEnv: {env: 'dev'},
            rightEnv: {env: 'prod'},
            sql: 'SELECT id, name FROM users',
            sampleRows: 100,
            execute,
        })

        assert.equal(result.diff.summary.modifiedRows, 1)
        assert.match(result.leftResult.label, /MySQL Dev/)
        assert.match(result.rightResult.label, /MySQL Prod/)
    })

    it('throws side error when baseline query fails', async () => {
        mockLocalStorage()
        const {executeCrossEnvSampleCompare} = await import('@/features/cross-env-compare/services/cross-env-compare.actions')
        const {CrossEnvCompareSideError} = await import('@/features/cross-env-compare/services/cross-env-compare.service')

        await assert.rejects(
            () =>
                executeCrossEnvSampleCompare({
                    left: leftScope,
                    right: rightScope,
                    leftEnv: {env: 'dev'},
                    rightEnv: {env: 'prod'},
                    sql: 'SELECT 1',
                    sampleRows: 10,
                    execute: async () => {
                        throw new Error('timeout')
                    },
                }),
            (error: unknown) => {
                assert.ok(error instanceof CrossEnvCompareSideError)
                assert.equal(error.side, 'left')
                return true
            },
        )
    })
})
