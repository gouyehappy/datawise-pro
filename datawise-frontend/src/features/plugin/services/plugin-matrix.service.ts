import type {PluginItem} from '@/core/types'
import {
    listDbTypesForPlugin,
    listPluginRequires,
    PLUGIN_IDS,
    PLUGIN_REGISTRY,
    type PluginId,
} from '@/features/plugin/services/plugin-registry.service'
import {CONNECTOR_CAPABILITY_MATRIX_CROSSREF} from '@/features/plugin/services/plugin-connector-crossref.service'

export interface PluginMatrixRow {
    id: PluginId
    category: PluginItem['category']
    enabled: boolean
    surfaces: string[]
    requires: PluginId[]
    dbTypes: string[]
    crossRef: string
}

/** 从 catalog + 注册表生成插件能力矩阵行（与 PLUGIN_REGISTRY 单一真相源对齐） */
export function buildPluginMatrixRows(items: PluginItem[]): PluginMatrixRow[] {
    const byId = new Map(items.map((item) => [item.id, item]))
    return PLUGIN_IDS.map((id) => {
        const item = byId.get(id)
        const meta = PLUGIN_REGISTRY[id]
        return {
            id,
            category: item?.category ?? 'tool',
            enabled: item?.enabled ?? true,
            surfaces: meta.surfaces,
            requires: listPluginRequires(id),
            dbTypes: listDbTypesForPlugin(id),
            crossRef: listDbTypesForPlugin(id).length > 0 ? CONNECTOR_CAPABILITY_MATRIX_CROSSREF : '',
        }
    })
}

function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
}

/** 导出能力矩阵 CSV（UTF-8，`|` 分隔多值列；crossRef 指向连接器能力文档） */
export function buildPluginMatrixCsv(rows: PluginMatrixRow[]): string {
    const header = ['id', 'category', 'enabled', 'surfaces', 'requires', 'dbTypes', 'crossRef']
    const lines = [header.join(',')]
    for (const row of rows) {
        lines.push(
            [
                row.id,
                row.category,
                row.enabled ? 'true' : 'false',
                row.surfaces.join('|'),
                row.requires.join('|'),
                row.dbTypes.join('|'),
                row.crossRef,
            ]
                .map(csvEscape)
                .join(','),
        )
    }
    return `${lines.join('\n')}\n`
}

export function downloadPluginMatrixCsv(rows: PluginMatrixRow[]): void {
    const blob = new Blob([buildPluginMatrixCsv(rows)], {type: 'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `datawise-plugin-matrix-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
}
