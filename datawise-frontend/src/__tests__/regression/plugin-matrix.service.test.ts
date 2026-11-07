import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {PluginItem} from '@/core/types'
import {buildPluginMatrixRows, buildPluginMatrixCsv} from '@/features/plugin/services/plugin-matrix.service'

describe('plugin-matrix.service', () => {
    const items: PluginItem[] = [
        {
            id: 'p-oracle-explorer',
            name: 'Oracle',
            version: '1.0.0',
            author: 'DataWise',
            description: 'oracle',
            enabled: true,
            category: 'datasource',
        },
        {
            id: 'p-ai-explain',
            name: 'AI explain',
            version: '1.0.0',
            author: 'DataWise',
            description: 'explain',
            enabled: false,
            category: 'ai',
        },
    ]

    it('buildPluginMatrixRows includes all PLUGIN_IDS with registry metadata', () => {
        const rows = buildPluginMatrixRows(items)
        assert.ok(rows.length >= 44)
        const oracle = rows.find((row) => row.id === 'p-oracle-explorer')
        assert.ok(oracle)
        assert.deepEqual(oracle!.dbTypes, ['oracle'])
        assert.ok(oracle!.surfaces.includes('explorer'))
        assert.ok(oracle!.crossRef.includes('docs/README.md'))
        assert.ok(oracle!.crossRef.includes('#connectors'))

        const aiExplain = rows.find((row) => row.id === 'p-ai-explain')
        assert.ok(aiExplain)
        assert.equal(aiExplain!.enabled, false)
        assert.equal(aiExplain!.crossRef, '')
        assert.deepEqual(aiExplain!.requires, ['p-console-ai', 'p-explain-plan'])
    })

    it('buildPluginMatrixCsv escapes commas and joins multi-value columns', () => {
        const rows = buildPluginMatrixRows(items)
        const csv = buildPluginMatrixCsv(rows)
        assert.ok(csv.startsWith('id,category,enabled,surfaces,requires,dbTypes,crossRef'))
        const aiLine = csv.split('\n').find((line) => line.startsWith('p-ai-explain,'))
        assert.ok(aiLine)
        assert.ok(aiLine!.includes('p-console-ai|p-explain-plan'))
        const oracleLine = csv.split('\n').find((line) => line.startsWith('p-oracle-explorer,'))
        assert.ok(oracleLine)
        assert.ok(oracleLine!.includes('docs/README.md'))
    })
})
