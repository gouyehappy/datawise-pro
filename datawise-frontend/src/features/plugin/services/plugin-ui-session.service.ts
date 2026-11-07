import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    readUserResourceJson,
    writeUserResourceJson,
} from '@/features/auth/services/user-scoped-storage.service'
import {resolveResourceStorageKey} from '@/features/auth/services/user-resource-policy'
import type {PluginPresetId} from '@/features/plugin/services/plugin-preset.service'

const STORAGE_KEY = 'datawise-plugin-reference-conflict-banner-dismiss'

export interface ReferenceConflictBannerDismiss {
    presetId: PluginPresetId
    conflictCount: number
}

function normalizeDismiss(raw: unknown): ReferenceConflictBannerDismiss | null {
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Record<string, unknown>
    if (typeof value.presetId !== 'string' || typeof value.conflictCount !== 'number') return null
    return {
        presetId: value.presetId as PluginPresetId,
        conflictCount: value.conflictCount,
    }
}

const dismissStorage = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined

export function readReferenceConflictBannerDismiss(): ReferenceConflictBannerDismiss | null {
    if (!dismissStorage) return null
    return readUserResourceJson(
        UserResource.AppConfig,
        STORAGE_KEY,
        normalizeDismiss,
        dismissStorage,
    )
}

export function writeReferenceConflictBannerDismiss(snapshot: ReferenceConflictBannerDismiss): void {
    if (!dismissStorage) return
    writeUserResourceJson(UserResource.AppConfig, STORAGE_KEY, snapshot, dismissStorage)
}

export function clearReferenceConflictBannerDismiss(): void {
    if (!dismissStorage) return
    const key = resolveResourceStorageKey(UserResource.AppConfig, STORAGE_KEY)
    if (key) dismissStorage.removeItem(key)
}

/** 会话内关闭 banner；对照预设或冲突数变化后重新展示 */
export function shouldShowReferenceConflictBanner(
    presetId: PluginPresetId,
    conflictCount: number,
    dismissed: ReferenceConflictBannerDismiss | null,
): boolean {
    if (conflictCount <= 0) return false
    if (!dismissed) return true
    return dismissed.presetId !== presetId || dismissed.conflictCount !== conflictCount
}
