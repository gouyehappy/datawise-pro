import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    CONNECTOR_CAPABILITY_DOC,
    CONNECTOR_CAPABILITY_MATRIX_CROSSREF,
    copyConnectorCapabilityDocPath,
    formatConnectorCapabilityCrossRefLabel,
    listExplorerPluginCrossRefs,
} from '@/features/plugin/services/plugin-connector-crossref.service'

describe('plugin-connector-crossref.service', () => {
    it('lists explorer plugins with db types', () => {
        const rows = listExplorerPluginCrossRefs()
        assert.ok(rows.length > 0)
        const mysql = rows.find((row) => row.pluginId === 'p-mysql-explorer')
        assert.ok(mysql)
        assert.ok(mysql!.dbTypes.includes('mysql'))
    })

    it('exports connector capability doc path', () => {
        assert.ok(CONNECTOR_CAPABILITY_DOC.includes('docs/README.md'))
    })

    it('copyConnectorCapabilityDocPath writes to clipboard', async () => {
        let copied = ''
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                clipboard: {
                    writeText: async (text: string) => {
                        copied = text
                    },
                },
            },
        })
        assert.equal(await copyConnectorCapabilityDocPath(CONNECTOR_CAPABILITY_DOC), true)
        assert.equal(copied, CONNECTOR_CAPABILITY_DOC)
        assert.equal(await copyConnectorCapabilityDocPath(''), false)
    })

    it('formatConnectorCapabilityCrossRefLabel shortens matrix crossRef for UI', () => {
        assert.equal(
            formatConnectorCapabilityCrossRefLabel(CONNECTOR_CAPABILITY_MATRIX_CROSSREF),
            'README.md §connectors',
        )
    })
})
