import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {defineFeature, registerFeatures, resetFeatureRegistry} from '@/core/feature-contract'
import {
    buildSettingsNavGroups,
    mergeSettingsNavGroups,
    SETTINGS_NAV_GROUPS,
} from '@/features/settings/constants/settings-nav.config'

describe('settings-nav feature contributions', () => {
    it('merges AI settings from Feature Contract into the ai group', () => {
        resetFeatureRegistry()
        registerFeatures([
            defineFeature({
                id: 'ai',
                contributes: {
                    settings: [
                        {
                            id: 'ai',
                            labelKey: 'settings.nav.aiModels',
                            groupKey: 'settings.nav.groups.ai',
                        },
                        {
                            id: 'dataAgent',
                            labelKey: 'settings.nav.dataAgent',
                            groupKey: 'settings.nav.groups.ai',
                        },
                    ],
                },
            }),
        ])
        const merged = mergeSettingsNavGroups(SETTINGS_NAV_GROUPS)
        const aiGroup = merged.find((group) => group.labelKey === 'settings.nav.groups.ai')
        assert.ok(aiGroup)
        assert.deepEqual(
            aiGroup.items.map((item) => item.id),
            ['ai', 'dataAgent'],
        )
        const built = buildSettingsNavGroups({isAdmin: true, hideAiSections: false})
        assert.ok(built.some((group) => group.items.some((item) => item.id === 'ai')))
        resetFeatureRegistry()
    })

    it('merges settings.feature baseline into empty group shells', () => {
        resetFeatureRegistry()
        registerFeatures([
            defineFeature({
                id: 'settings',
                contributes: {
                    settings: [
                        {
                            id: 'basic',
                            labelKey: 'settings.nav.basic',
                            groupKey: 'settings.nav.groups.preferences',
                        },
                    ],
                },
            }),
        ])
        const prefs = mergeSettingsNavGroups(SETTINGS_NAV_GROUPS).find(
            (group) => group.labelKey === 'settings.nav.groups.preferences',
        )
        assert.ok(prefs?.items.some((item) => item.id === 'basic'))
        resetFeatureRegistry()
    })
})
