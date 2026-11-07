import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isFreeDbType,
    resolvePackForDbType,
    PACK_CATALOG,
    SUITE_CATALOG,
} from '@/features/pack/catalog/pack-catalog'
import {PACK_IDS} from '@/features/pack/types/pack.types'

describe('pack catalog', () => {
    it('covers frozen pack ids', () => {
        const catalogIds = new Set(PACK_CATALOG.map((pack) => pack.id))
        for (const id of PACK_IDS) {
            assert.equal(catalogIds.has(id), true, `missing pack ${id}`)
        }
    })

    it('keeps free database types unlocked', () => {
        assert.equal(isFreeDbType('mysql'), true)
        assert.equal(isFreeDbType('postgresql'), true)
        assert.equal(resolvePackForDbType('mysql'), null)
    })

    it('maps enterprise and domestic connectors', () => {
        assert.equal(resolvePackForDbType('oracle'), 'pack.connector.enterprise')
        assert.equal(resolvePackForDbType('dm'), 'pack.connector.domestic')
        assert.equal(resolvePackForDbType('kafka'), 'pack.connector.bigdata')
    })

    it('defines recommended Pro suite with AI', () => {
        const pro = SUITE_CATALOG.find((suite) => suite.id === 'suite.pro')
        assert.ok(pro)
        assert.equal(pro?.recommended, true)
        assert.ok(pro?.packIds.includes('pack.ai'))
    })
})
