import assert from 'node:assert/strict'
import test from 'node:test'
import {
    DEFAULT_UI_DENSITY,
    UI_DENSITY_IDS,
    resolveUiDensityId,
} from '@/shared/config/ui-density'

test('ui density ids stay aligned', () => {
    assert.deepEqual([...UI_DENSITY_IDS], ['sm', 'md', 'lg'])
    assert.equal(DEFAULT_UI_DENSITY, 'md')
})

test('resolveUiDensityId falls back to md', () => {
    assert.equal(resolveUiDensityId('lg'), 'lg')
    assert.equal(resolveUiDensityId('nope'), 'md')
    assert.equal(resolveUiDensityId(null), 'md')
})
