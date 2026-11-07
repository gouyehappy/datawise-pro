import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createDefaultAppConfig} from '@/shared/config/app-config.defaults'
import {parseAppConfigXml, serializeAppConfigXml} from '@/shared/config/app-config-xml'

describe('app-config-xml plugins', () => {
    it('serializes plugins section with referencePresetId', () => {
        const config = createDefaultAppConfig()
        config.plugins = {
            enabled: {'p-grid-export': false},
            referencePresetId: 'developer',
        }
        const xml = serializeAppConfigXml(config)
        assert.ok(xml.includes('<plugins format="json">'))
        assert.ok(xml.includes('referencePresetId'))
        assert.ok(xml.includes('developer'))
        assert.ok(xml.includes('p-grid-export'))
    })

    it('round-trips plugins preferences through xml', () => {
        const config = createDefaultAppConfig()
        config.plugins = {
            enabled: {'p-sql-format': true},
            referencePresetId: 'teamViewer',
        }
        const parsed = parseAppConfigXml(serializeAppConfigXml(config))
        assert.ok(parsed?.plugins)
        assert.equal(parsed!.plugins!.referencePresetId, 'teamViewer')
        assert.equal(parsed!.plugins!.enabled['p-sql-format'], true)
    })
})
