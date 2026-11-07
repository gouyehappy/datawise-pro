import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    aliasCandidatesForTable,
    primaryAliasFromWords,
    suggestTableAlias,
    splitTableWords,
} from '../utils/alias-from-name.ts'

describe('table alias — from table name', () => {
    it('two-word snake_case → initials', () => {
        assert.deepEqual(splitTableWords('order_items'), ['order', 'items'])
        assert.equal(primaryAliasFromWords(['order', 'items']), 'oi')
        assert.equal(suggestTableAlias('order_items', new Set()), 'oi')
        assert.equal(suggestTableAlias('user_profile', new Set()), 'up')
    })

    it('single word → first 2–3 letters (skip SQL keywords)', () => {
        assert.equal(suggestTableAlias('users', new Set()), 'us')
        assert.equal(suggestTableAlias('orders', new Set()), 'ord')
    })

    it('three+ words → first letters of first 3 words', () => {
        assert.equal(suggestTableAlias('app_ai_config', new Set()), 'aac')
    })

    it('collision → extend deterministically', () => {
        const used = new Set(['oi'])
        assert.equal(suggestTableAlias('order_invoice', used), 'ori')
    })

    it('same initials from different tables stay unique', () => {
        const used = new Set<string>()
        const a = suggestTableAlias('order_items', used)
        used.add(a.toLowerCase())
        const b = suggestTableAlias('user_profile', used)
        assert.notEqual(a.toLowerCase(), b.toLowerCase())
        assert.equal(a, 'oi')
        assert.equal(b, 'up')
    })

    it('补全顺序无关：每张表别名只取决于表名与已占用集合', () => {
        const used = new Set(['us'])
        assert.equal(suggestTableAlias('order_items', used), 'oi')
    })

    it('schema-qualified table name', () => {
        assert.equal(suggestTableAlias('dw.order_items', new Set()), 'oi')
    })

    it('generates ordered unique candidates', () => {
        const candidates = aliasCandidatesForTable('order_items')
        assert.equal(candidates[0], 'oi')
        assert.ok(candidates.length > 1)
    })
})
