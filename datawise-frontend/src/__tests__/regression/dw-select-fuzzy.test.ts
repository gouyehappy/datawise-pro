import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {fuzzyMatchSelectText} from '../../core/components/select-fuzzy.ts'

describe('DwSelect fuzzy match', () => {
    it('matches substring case-insensitively', () => {
        assert.equal(fuzzyMatchSelectText('sdw-test17', 'TEST'), true)
        assert.equal(fuzzyMatchSelectText('kube-system', 'sys'), true)
        assert.equal(fuzzyMatchSelectText('default', 'xyz'), false)
    })

    it('matches sequential characters for light fuzzy', () => {
        assert.equal(fuzzyMatchSelectText('sdw-test17', 'st17'), true)
        assert.equal(fuzzyMatchSelectText('kubernetes', 'k8s'), false)
        assert.equal(fuzzyMatchSelectText('kubernetes', 'knts'), true)
    })

    it('empty query matches all', () => {
        assert.equal(fuzzyMatchSelectText('anything', ''), true)
        assert.equal(fuzzyMatchSelectText('anything', '   '), true)
    })
})
