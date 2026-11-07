import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {nextTick} from 'vue'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'

describe('useConfirmDialog', () => {
    it('resolves true on confirm and false on dismiss', async () => {
        const dialog = useConfirmDialog()
        const pending = dialog.ask({
            title: 'Delete',
            message: 'Are you sure?',
            confirmLabel: 'Delete',
        })
        assert.equal(dialog.open.value, true)
        assert.equal(dialog.title.value, 'Delete')
        assert.equal(dialog.confirmVariant.value, 'danger')

        dialog.onConfirm()
        assert.equal(await pending, true)
        assert.equal(dialog.open.value, false)

        const pendingCancel = dialog.ask({
            title: 'Delete',
            message: 'Again?',
            confirmVariant: 'primary',
        })
        assert.equal(dialog.confirmVariant.value, 'primary')
        dialog.onOpenUpdate(false)
        assert.equal(await pendingCancel, false)
        await nextTick()
        assert.equal(dialog.open.value, false)
    })
})
