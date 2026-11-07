import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {getContextMenuForNodeType} from '../../features/explorer/constants/context-menus.ts'

const t = ((key: string) => key) as never

describe('view_model context menu lineage item', () => {
    it('includes view-lineage action', () => {
        const items = getContextMenuForNodeType('view_model', t)
        assert.ok(items.some((item) => item.id === 'view-lineage'))
    })
})
