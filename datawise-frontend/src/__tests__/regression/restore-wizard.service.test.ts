import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveRestoreWizardMessageKey} from '@/features/explorer/services/restore-wizard-messages'

describe('restore-wizard.service', () => {
    it('resolveRestoreWizardMessageKey maps wizard copy kinds', () => {
        assert.equal(
            resolveRestoreWizardMessageKey('contextMissing'),
            'explorer.restoreWizardContextMissing',
        )
        assert.equal(resolveRestoreWizardMessageKey('readFailed'), 'explorer.restoreWizardReadFailed')
        assert.equal(resolveRestoreWizardMessageKey('guestDenied'), 'explorer.restoreWizard.guestDenied')
        assert.equal(resolveRestoreWizardMessageKey('done'), 'explorer.restoreWizardDone')
        assert.equal(resolveRestoreWizardMessageKey('failed'), 'explorer.restoreWizardFailed')
    })
})
