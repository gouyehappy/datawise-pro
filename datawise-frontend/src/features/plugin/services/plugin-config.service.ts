import type {PluginUsageEntry, PluginUsageStore} from '@/features/plugin/services/plugin-usage.service'
import {
    isPluginId,
    normalizePluginId,
    type PluginId,
} from '@/features/plugin/services/plugin-registry.service'
import {
    isPluginPresetId,
    normalizeReferencePresetId,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'

export interface PluginConfigExport {
    version: 2
    exportedAt: string
    enabled: Record<string, boolean>
    usage?: Record<string, PluginUsageEntry>
    referencePresetId?: PluginPresetId
}

export interface PluginConfigImport {
    enabled: Record<PluginId, boolean>
    usage?: PluginUsageStore
    referencePresetId?: PluginPresetId
}

export function buildPluginConfigExport(
    overrides: Record<string, boolean | undefined>,
    usage?: PluginUsageStore,
    referencePresetId?: PluginPresetId,
): PluginConfigExport {
    const enabled: Record<string, boolean> = {}
    for (const [rawId, value] of Object.entries(overrides)) {
        if (typeof value !== 'boolean') continue
        enabled[normalizePluginId(rawId)] = value
    }
    const payload: PluginConfigExport = {
        version: 2,
        exportedAt: new Date().toISOString(),
        enabled,
    }
    if (usage && Object.keys(usage).length > 0) {
        payload.usage = usage
    }
    if (referencePresetId && referencePresetId !== 'minimal') {
        payload.referencePresetId = referencePresetId
    }
    return payload
}

function normalizeUsageEntry(raw: unknown): PluginUsageEntry | null {
    if (!raw || typeof raw !== 'object') return null
    const entry = raw as Record<string, unknown>
    const enable = typeof entry.enable === 'number' ? entry.enable : 0
    const disable = typeof entry.disable === 'number' ? entry.disable : 0
    const lastAt = typeof entry.lastAt === 'string' ? entry.lastAt : undefined
    if (enable === 0 && disable === 0 && !lastAt) return null
    return {enable, disable, lastAt}
}

function parseUsageBlock(raw: unknown): PluginUsageStore | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const usage: PluginUsageStore = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const entry = normalizeUsageEntry(value)
        if (!entry) continue
        const id = normalizePluginId(key)
        if (!isPluginId(id)) continue
        usage[id] = entry
    }
    return Object.keys(usage).length > 0 ? usage : undefined
}

export function parsePluginConfigImport(raw: unknown): PluginConfigImport | null {
    if (!raw || typeof raw !== 'object') return null

    const root = raw as Record<string, unknown>
    const source =
        (root.version === 1 || root.version === 2) && root.enabled && typeof root.enabled === 'object'
            ? (root.enabled as Record<string, unknown>)
            : root.enabled && typeof root.enabled === 'object'
                ? (root.enabled as Record<string, unknown>)
                : root

    const enabled: Record<PluginId, boolean> = {} as Record<PluginId, boolean>
    for (const [key, value] of Object.entries(source)) {
        if (key === 'version' || key === 'exportedAt' || key === 'usage') continue
        if (typeof value !== 'boolean') continue
        const id = normalizePluginId(key)
        if (!isPluginId(id)) continue
        enabled[id] = value
    }

    const usage = parseUsageBlock(root.usage)
    const referencePresetId = isPluginPresetId(root.referencePresetId)
        ? root.referencePresetId
        : undefined
    if (Object.keys(enabled).length === 0 && !usage && !referencePresetId) return null
    return {enabled, usage, referencePresetId}
}

export function mergeImportedPluginOverrides(
    current: Record<string, boolean | undefined>,
    imported: Record<string, boolean>,
): Record<string, boolean> {
    const merged: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(current)) {
        if (typeof value === 'boolean') merged[key] = value
    }
    return {...merged, ...imported}
}

export function downloadPluginConfigJson(payload: PluginConfigExport): void {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `datawise-plugins-${payload.exportedAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
}
