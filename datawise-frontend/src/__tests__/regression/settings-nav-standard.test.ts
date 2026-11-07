import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'
import {registerFeatures, resetFeatureRegistry} from '@/core/feature-contract'
import {aiFeature} from '@/features/ai/ai.feature'
import {settingsFeature} from '@/features/settings/settings.feature'
import {
    buildSettingsNavGroups,
    isAiSettingsSection,
    isStandardHiddenSettingsSection,
} from '@/features/settings/constants/settings-nav.config'

describe('settings-nav standard edition', () => {
    beforeEach(() => {
        resetFeatureRegistry()
        registerFeatures([settingsFeature, aiFeature])
    })

    afterEach(() => {
        resetFeatureRegistry()
    })

    it('marks AI settings sections', () => {
        assert.equal(isAiSettingsSection('ai'), true)
        assert.equal(isAiSettingsSection('dataAgent'), true)
        assert.equal(isAiSettingsSection('knowledge'), true)
        assert.equal(isAiSettingsSection('basic'), false)
        assert.equal(isAiSettingsSection('backupCenter'), false)
    })

    it('marks standard-hidden settings sections', () => {
        assert.equal(isStandardHiddenSettingsSection('ai'), true)
        assert.equal(isStandardHiddenSettingsSection('backupCenter'), true)
        assert.equal(isStandardHiddenSettingsSection('basic'), false)
    })

    it('hides AI group when hideAiSections is true', () => {
        const groups = buildSettingsNavGroups({
            isAdmin: true,
            hideAiSections: true,
            hideBackupSection: false,
        })
        assert.equal(
            groups.some((group) => group.labelKey === 'settings.nav.groups.ai'),
            false,
        )
        assert.equal(
            groups.flatMap((group) => group.items).some((item) => item.id === 'ai'),
            false,
        )
        assert.ok(groups.some((group) => group.items.some((item) => item.id === 'basic')))
        assert.ok(groups.flatMap((group) => group.items).some((item) => item.id === 'backupCenter'))
    })

    it('hides backup center when hideBackupSection is true', () => {
        const groups = buildSettingsNavGroups({
            isAdmin: true,
            hideAiSections: false,
            hideBackupSection: true,
        })
        assert.equal(
            groups.flatMap((group) => group.items).some((item) => item.id === 'backupCenter'),
            false,
        )
        assert.ok(groups.some((group) => group.labelKey === 'settings.nav.groups.ai'))
    })

    it('keeps AI group when hideAiSections is false', () => {
        const groups = buildSettingsNavGroups({
            isAdmin: true,
            hideAiSections: false,
            hideBackupSection: false,
        })
        assert.ok(groups.some((group) => group.labelKey === 'settings.nav.groups.ai'))
        assert.ok(groups.flatMap((group) => group.items).some((item) => item.id === 'backupCenter'))
    })
})
