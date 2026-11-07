import {configApi} from '@/api'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    canSyncServerResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'
import {
    DEFAULT_UPDATE_PREFERENCES,
    type UpdateCheckResult,
    type UpdatePreferences,
    type UpdateStatusEvent,
    type UpdateStatusPhase,
} from '@/features/settings/types/about-settings.types'
import packageJson from '../../../../package.json'

export const APP_VERSION = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'

export const UPDATE_STORAGE_KEY = 'datawise-update-prefs'

export type {
    UpdateCheckResult,
    UpdatePreferences,
    UpdateStatusEvent,
    UpdateStatusPhase,
}
export {DEFAULT_UPDATE_PREFERENCES}

function desktopUpdater() {
    return globalThis.window?.datawise?.updater
}

/** 检查更新：优先使用桌面 host updater，否则回退为当前版本 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
    const updater = desktopUpdater()?.checkForUpdates
    if (updater) {
        return updater()
    }
    await delay(300)
    return {
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        hasUpdate: false,
    }
}

export async function downloadUpdate(): Promise<UpdateCheckResult> {
    const updater = desktopUpdater()?.downloadUpdate
    if (!updater) {
        return {
            currentVersion: APP_VERSION,
            latestVersion: APP_VERSION,
            hasUpdate: false,
            error: 'Desktop updater is unavailable',
        }
    }
    return updater()
}

export async function quitAndInstallUpdate(): Promise<boolean> {
    const updater = desktopUpdater()?.quitAndInstall
    if (!updater) return false
    return updater()
}

/** IPC 只能传可 Structured Clone 的纯对象；Vue/Pinia 的 Proxy 会抛 “could not be cloned”。 */
function toPlainUpdatePreferences(prefs: UpdatePreferences): UpdatePreferences {
    return {
        notifyOnUpdate: Boolean(prefs?.notifyOnUpdate),
        autoDownload: Boolean(prefs?.autoDownload),
    }
}

export async function syncUpdaterPreferencesToDesktop(prefs: UpdatePreferences): Promise<void> {
    const setter = desktopUpdater()?.setPreferences
    if (!setter) return
    try {
        await setter(toPlainUpdatePreferences(prefs))
    } catch (error) {
        console.warn('[updater] failed to sync preferences to desktop', error)
    }
}

export function subscribeUpdaterStatus(callback: (event: UpdateStatusEvent) => void): () => void {
    const onStatus = desktopUpdater()?.onStatus
    if (!onStatus) return () => undefined
    return onStatus(callback)
}

function resolveUpdateStorageKey(): string {
    return resolveResourceStorageKey(UserResource.UpdatePreferences, UPDATE_STORAGE_KEY)
        ?? UPDATE_STORAGE_KEY
}

export function readStoredUpdatePreferences(): UpdatePreferences {
    if (!canReadResource(UserResource.UpdatePreferences)) {
        return {...DEFAULT_UPDATE_PREFERENCES}
    }
    try {
        const raw = localStorage.getItem(resolveUpdateStorageKey())
        if (!raw) return {...DEFAULT_UPDATE_PREFERENCES}
        const parsed = JSON.parse(raw) as Partial<UpdatePreferences>
        return {
            notifyOnUpdate: parsed.notifyOnUpdate ?? DEFAULT_UPDATE_PREFERENCES.notifyOnUpdate,
            autoDownload: parsed.autoDownload ?? DEFAULT_UPDATE_PREFERENCES.autoDownload,
        }
    } catch {
        return {...DEFAULT_UPDATE_PREFERENCES}
    }
}

export function persistUpdatePreferences(prefs: UpdatePreferences) {
    if (!canPersistLocalResource(UserResource.UpdatePreferences)) return
    localStorage.setItem(resolveUpdateStorageKey(), JSON.stringify(prefs))
    void syncUpdaterPreferencesToDesktop(prefs)
    if (!canSyncServerResource(UserResource.UpdatePreferences)) return
    void configApi.saveUpdaterPreferences(prefs).catch((error) => {
        console.warn('[config] failed to persist updater.xml', error)
    })
}

export async function syncUpdatePreferencesFromServer(): Promise<UpdatePreferences> {
    try {
        const remote = await configApi.fetchUpdaterPreferences()
        if (canPersistLocalResource(UserResource.UpdatePreferences)) {
            localStorage.setItem(resolveUpdateStorageKey(), JSON.stringify(remote))
        }
        void syncUpdaterPreferencesToDesktop(remote)
        return remote
    } catch {
        const local = readStoredUpdatePreferences()
        void syncUpdaterPreferencesToDesktop(local)
        return local
    }
}

function delay(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}
