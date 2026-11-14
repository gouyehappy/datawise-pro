import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'
import {
    confirmDiscardConfigEdits,
    isConfigContentDirty,
} from '@/features/workspace/components/shared/config-content-edit'

describe('config-content-edit', () => {
    it('isConfigContentDirty compares draft to baseline only while editing', () => {
        assert.equal(isConfigContentDirty(false, 'a', 'b'), false)
        assert.equal(isConfigContentDirty(true, 'a', 'a'), false)
        assert.equal(isConfigContentDirty(true, 'a', 'b'), true)
        assert.equal(isConfigContentDirty(true, null, ''), false)
        assert.equal(isConfigContentDirty(true, undefined, 'x'), true)
    })

    it('confirmDiscardConfigEdits skips confirm when clean', async () => {
        const confirm = mock.fn(() => false)
        assert.equal(await confirmDiscardConfigEdits(false, 'discard?', confirm), true)
        assert.equal(confirm.mock.calls.length, 0)
    })

    it('confirmDiscardConfigEdits uses confirm when dirty', async () => {
        const confirm = mock.fn(() => true)
        assert.equal(await confirmDiscardConfigEdits(true, 'discard?', confirm), true)
        assert.equal(confirm.mock.calls.length, 1)
        assert.equal(confirm.mock.calls[0]?.arguments[0], 'discard?')

        confirm.mock.mockImplementationOnce(() => false)
        assert.equal(await confirmDiscardConfigEdits(true, 'discard?', confirm), false)
    })
})
