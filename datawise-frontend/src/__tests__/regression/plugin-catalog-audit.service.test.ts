import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {PluginItem} from '@/core/types'
import {PLUGIN_IDS} from '@/features/plugin/services/plugin-registry.service'
import {auditPluginCatalogConsistency} from '@/features/plugin/services/plugin-catalog-audit.service'

function catalogFromRegistry(): PluginItem[] {
    return PLUGIN_IDS.map((id) => ({
        id,
        name: id,
        description: '',
        version: '0.0.0',
        author: 'test',
        category: 'tool' as const,
        enabled: true,
    }))
}

describe('plugin-catalog-audit.service', () => {
    it('reports no issues when catalog matches registry and hooks are known', () => {
        const issues = auditPluginCatalogConsistency(catalogFromRegistry(), {
            beforeExecute: [],
            afterResult: [],
            renderGrid: [],
        })
        assert.equal(issues.length, 0)
    })

    it('reports catalogMissing when registry id absent from API catalog', () => {
        const catalog = catalogFromRegistry().filter((item) => item.id !== 'p-grid-export')
        const issues = auditPluginCatalogConsistency(catalog)
        assert.ok(issues.some((issue) => issue.kind === 'catalogMissing' && issue.id === 'p-grid-export'))
    })

    it('reports registryMissing when catalog has unknown id', () => {
        const catalog = [
            ...catalogFromRegistry(),
            {
                id: 'p-unknown-plugin',
                name: 'Unknown',
                description: '',
                version: '0.0.0',
                author: 'test',
                category: 'tool' as const,
                enabled: true,
            },
        ]
        const issues = auditPluginCatalogConsistency(catalog)
        assert.ok(
            issues.some((issue) => issue.kind === 'registryMissing' && issue.id === 'p-unknown-plugin'),
        )
    })

    it('reports hookUnknown for unregistered plugin ids', () => {
        const issues = auditPluginCatalogConsistency(catalogFromRegistry(), {
            beforeExecute: ['p-custom-hook'],
            afterResult: [],
            renderGrid: [],
        })
        assert.ok(
            issues.some(
                (issue) =>
                    issue.kind === 'hookUnknown'
                    && issue.id === 'p-custom-hook'
                    && issue.detail === 'beforeExecute',
            ),
        )
    })
})
