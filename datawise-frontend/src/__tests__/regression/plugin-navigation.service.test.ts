import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolvePluginCatalogAuditExitCode, shouldShowPresetAlignAllAction} from '@/features/plugin/services/plugin-navigation.service'

describe('plugin-navigation.service', () => {
    it('resolvePluginCatalogAuditExitCode fails on consistency issues by default', () => {
        assert.equal(
            resolvePluginCatalogAuditExitCode({
                consistencyIssueCount: 1,
                metadataIssueCount: 0,
                strict: false,
            }),
            1,
        )
    })

    it('resolvePluginCatalogAuditExitCode ignores metadata issues unless strict', () => {
        assert.equal(
            resolvePluginCatalogAuditExitCode({
                consistencyIssueCount: 0,
                metadataIssueCount: 2,
                strict: false,
            }),
            0,
        )
        assert.equal(
            resolvePluginCatalogAuditExitCode({
                consistencyIssueCount: 0,
                metadataIssueCount: 2,
                strict: true,
            }),
            1,
        )
    })

    it('shouldShowPresetAlignAllAction shows batch entry for multi conflicts or external mismatch', () => {
        assert.equal(shouldShowPresetAlignAllAction(3, true), true)
        assert.equal(shouldShowPresetAlignAllAction(1, true), false)
        assert.equal(shouldShowPresetAlignAllAction(2, false), true)
        assert.equal(shouldShowPresetAlignAllAction(0, false), false)
    })
})
