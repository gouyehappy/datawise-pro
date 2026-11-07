import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {searchPaletteNavigationEntries} from '@/features/layout/services/palette-navigation.service'

describe('palette-navigation.service', () => {
    it('filters navigation entries by label, group, and hint', () => {
        const entries = [
            {id: 'module:database', label: 'Database', group: 'Navigation', run: () => {}},
            {id: 'action:new-console', label: 'New console', group: 'Actions', run: () => {}},
            {id: 'sql:1', label: 'SELECT 1', hint: '10:00', group: 'Recent SQL', run: () => {}},
        ]
        assert.deepEqual(searchPaletteNavigationEntries(entries, 'database').map((item) => item.id), [
            'module:database',
        ])
        assert.deepEqual(searchPaletteNavigationEntries(entries, '10:00').map((item) => item.id), ['sql:1'])
        assert.equal(searchPaletteNavigationEntries(entries, '').length, 3)
    })
})
