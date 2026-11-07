import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    applyPluginRenderGrid,
    clearPluginHooks,
    registerPluginHooks,
    runPluginBeforeExecute,
    unregisterPluginHooks,
} from '@/features/plugin/services/plugin-hook.service'

describe('plugin-hook.service', () => {
    it('chains beforeExecute hooks and respects enablement', async () => {
        clearPluginHooks()
        registerPluginHooks('p-a', {
            beforeExecute: ({sql}) => ({sql: `${sql}; -- a`}),
        })
        registerPluginHooks('p-b', {
            beforeExecute: () => ({cancel: true, message: 'blocked'}),
        })

        const enabledOnlyA = await runPluginBeforeExecute(
            {sql: 'SELECT 1', connectionId: 'c1'},
            (id) => id === 'p-a',
        )
        assert.equal(enabledOnlyA.sql, 'SELECT 1; -- a')
        assert.notEqual(enabledOnlyA.cancel, true)

        const both = await runPluginBeforeExecute(
            {sql: 'SELECT 1', connectionId: 'c1'},
            () => true,
        )
        assert.equal(both.cancel, true)
        assert.equal(both.message, 'blocked')

        unregisterPluginHooks('p-a')
        unregisterPluginHooks('p-b')
        clearPluginHooks()
    })

    it('applies renderGrid hooks in registration order', () => {
        clearPluginHooks()
        registerPluginHooks('p-mask', {
            renderGrid: ({rows}) => ({
                rows: rows.map((row) => ({...row, masked: true})),
            }),
        })

        const result = applyPluginRenderGrid(
            [{name: 'id', type: 'INT'}],
            [{id: 1}],
            {},
            () => true,
        )
        assert.equal(result.rows[0]?.masked, true)
        clearPluginHooks()
    })

    it('supports batch-style sequential beforeExecute and cancel', async () => {
        clearPluginHooks()
        registerPluginHooks('p-transform', {
            beforeExecute: ({sql}) => ({sql: `${sql}; -- ok`}),
        })
        registerPluginHooks('p-block-second', {
            beforeExecute: ({sql}) =>
                sql.includes('2') ? {cancel: true, message: 'blocked'} : undefined,
        })

        const statements = ['SELECT 1', 'SELECT 2']
        const executed: string[] = []
        let blockedMessage: string | null = null

        for (const raw of statements) {
            const hooked = await runPluginBeforeExecute(
                {sql: raw, connectionId: 'conn-1'},
                () => true,
            )
            if (hooked.cancel) {
                blockedMessage = hooked.message ?? null
                break
            }
            executed.push(hooked.sql ?? raw)
        }

        assert.deepEqual(executed, ['SELECT 1; -- ok'])
        assert.equal(blockedMessage, 'blocked')
        clearPluginHooks()
    })
})
