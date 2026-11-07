import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {PluginItem} from '@/core/types'
import {PLUGIN_IDS} from '@/features/plugin/services/plugin-registry.service'
import {
    auditPluginCatalogMetadata,
    buildPluginCatalogRegistryDiffCsv,
    buildPluginCatalogRegistryDiffRows,
} from '@/features/plugin/services/plugin-catalog-metadata.service'

function catalogFromRegistry(): PluginItem[] {
    return PLUGIN_IDS.map((id) => ({
        id,
        name: id,
        description: '',
        version: '0.0.0',
        author: 'test',
        category: id === 'p-ai-workbench' ? ('ai' as const) : id.endsWith('-explorer') ? ('datasource' as const) : ('tool' as const),
        enabled: true,
    }))
}

describe('plugin-catalog-metadata.service', () => {
    it('reports no metadata issues when categories match registry rules', () => {
        const issues = auditPluginCatalogMetadata(catalogFromRegistry())
        assert.equal(issues.length, 0)
    })

    it('reports explorerCategory when datasource plugin has wrong catalog category', () => {
        const catalog = catalogFromRegistry().map((item) =>
            item.id === 'p-mysql-explorer' ? {...item, category: 'tool' as const} : item,
        )
        const issues = auditPluginCatalogMetadata(catalog)
        assert.ok(
            issues.some(
                (issue) => issue.kind === 'explorerCategory' && issue.id === 'p-mysql-explorer',
            ),
        )
    })

    it('reports aiCategory when aiWorkbench plugin has wrong catalog category', () => {
        const catalog = catalogFromRegistry().map((item) =>
            item.id === 'p-ai-workbench' ? {...item, category: 'tool' as const} : item,
        )
        const issues = auditPluginCatalogMetadata(catalog)
        assert.ok(
            issues.some((issue) => issue.kind === 'aiCategory' && issue.id === 'p-ai-workbench'),
        )
    })

    it('buildPluginCatalogRegistryDiffRows includes all registry ids and unknown catalog ids', () => {
        const catalog = [
            ...catalogFromRegistry(),
            {
                id: 'p-unknown-catalog-only',
                name: 'Unknown',
                description: '',
                version: '0.0.0',
                author: 'test',
                category: 'tool' as const,
                enabled: false,
            },
        ]
        const rows = buildPluginCatalogRegistryDiffRows(catalog)
        assert.equal(rows.filter((row) => row.inRegistry).length, PLUGIN_IDS.length)
        assert.ok(rows.some((row) => row.id === 'p-unknown-catalog-only' && row.inCatalog && !row.inRegistry))
    })

    it('buildPluginCatalogRegistryDiffCsv emits header and boolean columns', () => {
        const csv = buildPluginCatalogRegistryDiffCsv([
            {
                id: 'p-test',
                inCatalog: true,
                inRegistry: false,
                catalogCategory: 'tool',
                catalogEnabledDefault: 'true',
                registrySurfaces: '',
                dbTypes: '',
            },
        ])
        assert.ok(csv.startsWith('id,inCatalog,inRegistry,catalogCategory,catalogEnabledDefault,registrySurfaces,dbTypes\n'))
        const dataLine = csv.trim().split('\n')[1]
        assert.equal(dataLine, 'p-test,true,false,tool,true,,')
    })
})
