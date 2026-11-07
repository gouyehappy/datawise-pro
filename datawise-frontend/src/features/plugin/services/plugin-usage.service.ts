import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    readUserResourceJson,
    writeUserResourceJson,
} from '@/features/auth/services/user-scoped-storage.service'
import {isPluginId, normalizePluginId} from '@/features/plugin/services/plugin-registry.service'

const STORAGE_KEY = 'datawise-plugin-usage'

export interface PluginUsageEntry {
    enable: number
    disable: number
    lastAt?: string
}

export type PluginUsageStore = Record<string, PluginUsageEntry>

function normalizeStore(raw: unknown): PluginUsageStore | null {
    if (!raw || typeof raw !== 'object') return null
    const store: PluginUsageStore = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue
        const entry = value as Record<string, unknown>
        const enable = typeof entry.enable === 'number' ? entry.enable : 0
        const disable = typeof entry.disable === 'number' ? entry.disable : 0
        const lastAt = typeof entry.lastAt === 'string' ? entry.lastAt : undefined
        store[normalizePluginId(key)] = {enable, disable, lastAt}
    }
    return store
}

function readStore(): PluginUsageStore {
    return (
        readUserResourceJson(UserResource.AppConfig, STORAGE_KEY, normalizeStore) ?? {}
    )
}

function writeStore(store: PluginUsageStore): void {
    writeUserResourceJson(UserResource.AppConfig, STORAGE_KEY, store)
}

export function recordPluginToggle(id: string, enabled: boolean): void {
    const key = normalizePluginId(id)
    if (!isPluginId(key)) return
    const store = readStore()
    const entry = store[key] ?? {enable: 0, disable: 0}
    if (enabled) entry.enable += 1
    else entry.disable += 1
    entry.lastAt = new Date().toISOString()
    store[key] = entry
    writeStore(store)
}

export function getPluginUsage(id: string): PluginUsageEntry | null {
    const key = normalizePluginId(id)
    return readStore()[key] ?? null
}

export function pluginUsageTotal(entry: PluginUsageEntry | null | undefined): number {
    if (!entry) return 0
    return entry.enable + entry.disable
}

export interface PluginUsageLeaderboardRow {
    id: string
    entry: PluginUsageEntry
    total: number
}

export function listPluginUsageLeaderboard(limit = 10): PluginUsageLeaderboardRow[] {
    const store = readStore()
    return Object.entries(store)
        .map(([id, entry]) => ({id, entry, total: pluginUsageTotal(entry)}))
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
        .slice(0, limit)
}

export function clearPluginUsageStats(): void {
    writeStore({})
}

export function exportPluginUsageSnapshot(): PluginUsageStore {
    return readStore()
}

function pickLatestIso(a?: string, b?: string): string | undefined {
    if (!a) return b
    if (!b) return a
    return Date.parse(a) >= Date.parse(b) ? a : b
}

function mergeUsageEntry(
    current: PluginUsageEntry | undefined,
    imported: PluginUsageEntry,
): PluginUsageEntry {
    if (!current) return {...imported}
    return {
        enable: current.enable + imported.enable,
        disable: current.disable + imported.disable,
        lastAt: pickLatestIso(current.lastAt, imported.lastAt),
    }
}

export function mergeImportedPluginUsage(imported: PluginUsageStore): void {
    const store = readStore()
    for (const [rawId, entry] of Object.entries(imported)) {
        const id = normalizePluginId(rawId)
        if (!isPluginId(id)) continue
        store[id] = mergeUsageEntry(store[id], entry)
    }
    writeStore(store)
}

export function pluginUsageLastAtMs(id: string): number {
    const lastAt = getPluginUsage(id)?.lastAt
    return lastAt ? Date.parse(lastAt) : 0
}

export function comparePluginUsageIds(a: string, b: string): number {
    const totalDiff = pluginUsageTotal(getPluginUsage(b)) - pluginUsageTotal(getPluginUsage(a))
    if (totalDiff !== 0) return totalDiff
    return pluginUsageLastAtMs(b) - pluginUsageLastAtMs(a)
}
