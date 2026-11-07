import type {PluginItem} from '@/core/types'
import {
    isPluginId,
    normalizePluginId,
    PLUGIN_IDS,
    isKnownPluginId,
} from '@/features/plugin/services/plugin-registry.service'
import {listRegisteredPluginHooks} from '@/features/plugin/services/plugin-hook.service'
import type {PluginHookName} from '@/features/plugin/types/plugin-hook.types'

export type PluginCatalogAuditKind = 'catalogMissing' | 'registryMissing' | 'hookUnknown'

export interface PluginCatalogAuditIssue {
    kind: PluginCatalogAuditKind
    id: string
    detail?: string
}

const HOOK_NAMES: PluginHookName[] = ['beforeExecute', 'afterResult', 'renderGrid']

/** catalog API、前端注册表与运行时 Hook 注册的一致性检查（开发/运维诊断） */
export function auditPluginCatalogConsistency(
    catalogItems: PluginItem[],
    hookRegistry = listRegisteredPluginHooks(),
): PluginCatalogAuditIssue[] {
    const issues: PluginCatalogAuditIssue[] = []
    const catalogIds = new Set(catalogItems.map((item) => normalizePluginId(item.id)))
    const registryIds = new Set(PLUGIN_IDS)

    for (const id of catalogIds) {
        if (!isPluginId(id)) {
            issues.push({
                kind: 'registryMissing',
                id,
                detail: 'catalog id not in PLUGIN_REGISTRY',
            })
        }
    }

    for (const id of registryIds) {
        if (!catalogIds.has(id)) {
            issues.push({
                kind: 'catalogMissing',
                id,
                detail: 'missing from API catalog',
            })
        }
    }

    for (const hook of HOOK_NAMES) {
        for (const pluginId of hookRegistry[hook]) {
            if (!isKnownPluginId(pluginId)) {
                issues.push({
                    kind: 'hookUnknown',
                    id: pluginId,
                    detail: hook,
                })
            }
        }
    }

    return issues.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind))
}
