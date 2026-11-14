import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    SETTINGS_NAV_GROUPS,
    shouldCollapseSettingsGroup,
} from '@/features/settings/constants/settings-nav.config'

describe('settings-nav-focus', () => {
    it('keeps AI / security preferred-open metadata', () => {
        const ai = SETTINGS_NAV_GROUPS.find((g) => g.labelKey === 'settings.nav.groups.ai')
        const security = SETTINGS_NAV_GROUPS.find((g) => g.labelKey === 'settings.nav.groups.security')
        assert.deepEqual(ai?.preferredOpenInModes, ['analyze'])
        assert.deepEqual(security?.preferredOpenInModes, ['govern'])
        assert.equal(ai?.defaultCollapsed, true)
        assert.equal(security?.defaultCollapsed, true)
    })

    it('expands preferred groups for matching workbench focus', () => {
        const ai = {defaultCollapsed: true, preferredOpenInModes: ['analyze'] as const}
        assert.equal(shouldCollapseSettingsGroup(ai, 'analyze'), false)
        assert.equal(shouldCollapseSettingsGroup(ai, 'query'), true)
        const security = {defaultCollapsed: true, preferredOpenInModes: ['govern'] as const}
        assert.equal(shouldCollapseSettingsGroup(security, 'govern'), false)
        assert.equal(shouldCollapseSettingsGroup(security, 'ops'), true)
    })
})
