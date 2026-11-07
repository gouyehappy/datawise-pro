import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildSessionSqlContextMenuItems} from '@/features/workspace/constants/session-sql-context-menu'

const t = ((key: string) => key) as never

describe('session-sql-context-menu', () => {
    it('disables open when sql is empty', () => {
        const items = buildSessionSqlContextMenuItems(t, {
            hasSql: false,
            explainSupported: true,
        })
        assert.equal(items[0]?.disabled, true)
        assert.equal(items[1]?.disabled, true)
    })

    it('enables view plan only when explain is supported', () => {
        const supported = buildSessionSqlContextMenuItems(t, {
            hasSql: true,
            explainSupported: true,
            explainDisabledHint: 'unsupported',
        })
        assert.equal(supported[0]?.disabled, false)
        assert.equal(supported[1]?.disabled, false)

        const unsupported = buildSessionSqlContextMenuItems(t, {
            hasSql: true,
            explainSupported: false,
            explainDisabledHint: 'unsupported',
        })
        assert.equal(unsupported[1]?.disabled, true)
        assert.equal(unsupported[1]?.disabledHint, 'unsupported')
    })
})
