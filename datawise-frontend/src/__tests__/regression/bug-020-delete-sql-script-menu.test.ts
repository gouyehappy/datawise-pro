import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {getContextMenuForNodeType} from '../../features/explorer/constants/context-menus.ts'

const t = ((key: string) => key) as never

describe('sql_file context menu delete', () => {
    it('includes delete action for workspace scripts', () => {
        const items = getContextMenuForNodeType('sql_file', t)
        assert.ok(items.some((item) => item.id === 'delete-sql-file' && item.danger))
    })

    it('includes script history action', () => {
        const items = getContextMenuForNodeType('sql_file', t)
        assert.ok(items.some((item) => item.id === 'script-history'))
    })
})
