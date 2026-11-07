import type {PluginItem} from '@/core/types'
import {
    isPluginId,
    listDbTypesForPlugin,
    normalizePluginId,
    PLUGIN_IDS,
    PLUGIN_REGISTRY,
    type PluginId,
} from '@/features/plugin/services/plugin-registry.service'

export type PluginCatalogMetadataKind = 'explorerCategory' | 'aiCategory'

export interface PluginCatalogMetadataIssue {
    kind: PluginCatalogMetadataKind
    id: string
    detail: string
}

export interface PluginCatalogRegistryDiffRow {
    id: string
    inCatalog: boolean
    inRegistry: boolean
    catalogCategory: string
    catalogEnabledDefault: string
    registrySurfaces: string
    dbTypes: string
}

/** plugins.json catalog 与 PLUGIN_REGISTRY 元数据规则校验 */
export function auditPluginCatalogMetadata(catalogItems: PluginItem[]): PluginCatalogMetadataIssue[] {
    const byId = new Map(catalogItems.map((item) => [normalizePluginId(item.id), item]))
    const issues: PluginCatalogMetadataIssue[] = []

    for (const id of PLUGIN_IDS) {
        const item = byId.get(id)
        if (!item) continue
        const meta = PLUGIN_REGISTRY[id]
        const dbTypes = listDbTypesForPlugin(id)

        if (dbTypes.length > 0 && item.category !== 'datasource') {
            issues.push({
                kind: 'explorerCategory',
                id,
                detail: `expected category=datasource, catalog=${item.category}`,
            })
        }

        if (meta.surfaces.includes('aiWorkbench') && item.category !== 'ai') {
            issues.push({
                kind: 'aiCategory',
                id,
                detail: `expected category=ai, catalog=${item.category}`,
            })
        }
    }

    return issues.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind))
}

/** catalog ↔ registry 并排 diff 行（运维/开发导出） */
export function buildPluginCatalogRegistryDiffRows(catalogItems: PluginItem[]): PluginCatalogRegistryDiffRow[] {
    const byId = new Map(catalogItems.map((item) => [normalizePluginId(item.id), item]))
    const catalogIds = new Set(catalogItems.map((item) => normalizePluginId(item.id)))

    const registryRows: PluginCatalogRegistryDiffRow[] = PLUGIN_IDS.map((id) => {
        const item = byId.get(id)
        const meta = PLUGIN_REGISTRY[id]
        return {
            id,
            inCatalog: catalogIds.has(id),
            inRegistry: true,
            catalogCategory: item?.category ?? '',
            catalogEnabledDefault: item ? String(item.enabled) : '',
            registrySurfaces: meta.surfaces.join('|'),
            dbTypes: listDbTypesForPlugin(id).join('|'),
        }
    })

    const orphanCatalogRows: PluginCatalogRegistryDiffRow[] = catalogItems
        .filter((item) => !isPluginId(normalizePluginId(item.id)))
        .map((item) => ({
            id: normalizePluginId(item.id),
            inCatalog: true,
            inRegistry: false,
            catalogCategory: item.category,
            catalogEnabledDefault: String(item.enabled),
            registrySurfaces: '',
            dbTypes: '',
        }))

    return [...registryRows, ...orphanCatalogRows].sort((a, b) => a.id.localeCompare(b.id))
}

function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
}

export function buildPluginCatalogRegistryDiffCsv(rows: PluginCatalogRegistryDiffRow[]): string {
    const header = [
        'id',
        'inCatalog',
        'inRegistry',
        'catalogCategory',
        'catalogEnabledDefault',
        'registrySurfaces',
        'dbTypes',
    ]
    const lines = [header.join(',')]
    for (const row of rows) {
        lines.push(
            [
                row.id,
                row.inCatalog ? 'true' : 'false',
                row.inRegistry ? 'true' : 'false',
                row.catalogCategory,
                row.catalogEnabledDefault,
                row.registrySurfaces,
                row.dbTypes,
            ]
                .map(csvEscape)
                .join(','),
        )
    }
    return `${lines.join('\n')}\n`
}

export function downloadPluginCatalogRegistryDiffCsv(rows: PluginCatalogRegistryDiffRow[]): void {
    const blob = new Blob([buildPluginCatalogRegistryDiffCsv(rows)], {type: 'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `datawise-plugin-catalog-diff-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
}
