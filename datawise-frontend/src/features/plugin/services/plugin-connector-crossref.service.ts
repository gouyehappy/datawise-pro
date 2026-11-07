import {
    listDbTypesForPlugin,
    PLUGIN_IDS,
    type PluginId,
} from '@/features/plugin/services/plugin-registry.service'

export interface ExplorerPluginCrossRefRow {
    pluginId: PluginId
    dbTypes: string[]
}

/** 数据源 Explorer 插件与 DbType 的交叉索引（连接器说明见 docs/README.md） */
export function listExplorerPluginCrossRefs(): ExplorerPluginCrossRefRow[] {
    return PLUGIN_IDS.map((pluginId) => ({
        pluginId,
        dbTypes: listDbTypesForPlugin(pluginId),
    })).filter((row) => row.dbTypes.length > 0)
}

export const CONNECTOR_CAPABILITY_DOC = 'docs/README.md'
export const CONNECTOR_CAPABILITY_MATRIX_CROSSREF = `${CONNECTOR_CAPABILITY_DOC}#connectors`
export const PLUGIN_CENTER_DOC = 'docs/README.md#plugins'

/** 复制连接器能力文档路径到剪贴板（桌面端在 IDE 中打开） */
export async function copyConnectorCapabilityDocPath(path: string): Promise<boolean> {
    if (!path || !navigator.clipboard?.writeText) return false
    try {
        await navigator.clipboard.writeText(path)
        return true
    } catch {
        return false
    }
}

/** 矩阵 UI 用短标签，避免 crossRef 列撑满整行 */
export function formatConnectorCapabilityCrossRefLabel(path: string): string {
    if (!path) return ''
    if (path.includes('README.md')) return 'README.md §connectors'
    const file = path.split('#')[0]?.split('/').pop() ?? path
    return path.includes('#') ? `${file} §…` : file
}
