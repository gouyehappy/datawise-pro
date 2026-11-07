import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {schemaFingerprint} from '../completion/analysis-cache.ts'

describe('completion/analysis-cache', () => {
    it('schemaFingerprint 区分不同表集合', () => {
        const a = schemaFingerprint(['orders', 'users'], {orders: [{name: 'id'}], users: [{name: 'id'}]})
        const b = schemaFingerprint(['orders', 'products'], {orders: [{name: 'id'}], products: [{name: 'id'}]})
        assert.notEqual(a, b)
    })

    it('schemaFingerprint 区分同表不同列数', () => {
        const a = schemaFingerprint(['t'], {t: [{name: 'a'}, {name: 'b'}]})
        const b = schemaFingerprint(['t'], {t: [{name: 'a'}]})
        assert.notEqual(a, b)
    })

    it('schemaFingerprint 表序无关', () => {
        const a = schemaFingerprint(['b', 'a'], {a: [{name: 'id'}], b: [{name: 'id'}]})
        const b = schemaFingerprint(['a', 'b'], {a: [{name: 'id'}], b: [{name: 'id'}]})
        assert.equal(a, b)
    })

    it('schemaFingerprint 区分表注释 / 列注释', () => {
        const base = schemaFingerprint(['orders'], {orders: [{name: 'id'}]})
        const withTable = schemaFingerprint(
            ['orders'],
            {orders: [{name: 'id'}]},
            {orders: '订单表'},
        )
        const withCol = schemaFingerprint(
            ['orders'],
            {orders: [{name: 'id', comment: '主键'}]},
        )
        assert.notEqual(base, withTable)
        assert.notEqual(base, withCol)
        assert.notEqual(withTable, withCol)
    })
})
