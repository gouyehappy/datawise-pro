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
    type UpdateCheckOptions,
    type UpdateCheckResult,
    type UpdateInstallResult,
    type UpdatePreferences,
    type UpdateStatusEvent,
    type UpdateStatusPhase,
} from '@/features/settings/types/about-settings.types'
import packageJson from '../../../../package.json'

export const APP_VERSION = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'

export const UPDATE_STORAGE_KEY = 'datawise-update-prefs'

export type {
    UpdateCheckOptions,
    UpdateCheckResult,
    UpdateInstallResult,
    UpdatePreferences,
    UpdateStatusEvent,
    UpdateStatusPhase,
}
export {DEFAULT_UPDATE_PREFERENCES, formatUpdateBytes} from '@/features/settings/types/about-settings.types'

function desktopUpdater() {
    return globalThis.window?.datawise?.updater
}

function normalizeCheckResult(raw: UpdateCheckResult | Record<string, unknown> | null | undefined): UpdateCheckResult {
    if (!raw || typeof raw !== 'object') {
        return {
            currentVersion: APP_VERSION,
            latestVersion: APP_VERSION,
            hasUpdate: false,
        }
    }
    const r = raw as UpdateCheckResult
    return {
        currentVersion: String(r.currentVersion ?? APP_VERSION),
        latestVersion: String(r.latestVersion ?? APP_VERSION),
        hasUpdate: Boolean(r.hasUpdate),
        downloadReady: Boolean(r.downloadReady),
        downloading: Boolean(r.downloading),
        error: r.error ? String(r.error) : undefined,
        updateChannel: r.updateChannel as UpdateCheckResult['updateChannel'],
        updateKind: r.updateKind ? String(r.updateKind) : undefined,
        updateKinds: Array.isArray(r.updateKinds) ? r.updateKinds.map(String) : undefined,
        updateSummary: r.updateSummary ? String(r.updateSummary) : undefined,
        downloadBytes: typeof r.downloadBytes === 'number' ? r.downloadBytes : undefined,
        fullPackageBytes: typeof r.fullPackageBytes === 'number' ? r.fullPackageBytes : undefined,
        savedBytes: typeof r.savedBytes === 'number' ? r.savedBytes : undefined,
        installAction: r.installAction as UpdateCheckResult['installAction'],
        releaseNotes: r.releaseNotes ? String(r.releaseNotes) : undefined,
        cached: Boolean(r.cached),
        checkedAt: typeof r.checkedAt === 'number' ? r.checkedAt : undefined,
        nextCheckAt: typeof r.nextCheckAt === 'number' ? r.nextCheckAt : undefined,
        checkIntervalMs: typeof r.checkIntervalMs === 'number' ? r.checkIntervalMs : undefined,
    }
}

/** 检查更新：优先桌面 host（自动检查最多每小时一次；force 时不限次数） */
export async function checkForUpdates(options?: UpdateCheckOptions): Promise<UpdateCheckResult> {
    const updater = desktopUpdater()?.checkForUpdates
    if (updater) {
        const force = Boolean(options?.force)
        return normalizeCheckResult(await updater(force ? {force: true} : undefined))
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
    return normalizeCheckResult(await updater())
}

export async function quitAndInstallUpdate(): Promise<UpdateInstallResult> {
    const updater = desktopUpdater()?.quitAndInstall
    if (!updater) {
        return {ok: false, error: 'Desktop updater is unavailable'}
    }
    const raw = await updater()
    if (typeof raw === 'boolean') {
        return {ok: raw, restartRequired: raw}
    }
    if (raw && typeof raw === 'object') {
        const obj = raw as UpdateInstallResult
        return {
            ok: Boolean(obj.ok),
            restartRequired: obj.restartRequired !== false,
            channel: obj.channel ? String(obj.channel) : undefined,
            installAction: obj.installAction ? String(obj.installAction) : undefined,
            applied: Array.isArray(obj.applied) ? obj.applied.map(String) : undefined,
            error: obj.error ? String(obj.error) : undefined,
        }
    }
    return {ok: false, error: 'unexpected_install_result'}
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
    return onStatus((event) => {
        callback({
            phase: event.phase as UpdateStatusPhase,
            currentVersion: String(event.currentVersion ?? APP_VERSION),
            latestVersion: String(event.latestVersion ?? APP_VERSION),
            percent: typeof event.percent === 'number' ? event.percent : undefined,
            error: event.error ? String(event.error) : undefined,
            activeKind: event.activeKind ? String(event.activeKind) : undefined,
            updateChannel: event.updateChannel as UpdateStatusEvent['updateChannel'],
            updateKind: event.updateKind ? String(event.updateKind) : undefined,
            updateKinds: Array.isArray(event.updateKinds) ? event.updateKinds.map(String) : undefined,
            updateSummary: event.updateSummary ? String(event.updateSummary) : undefined,
            downloadBytes: typeof event.downloadBytes === 'number' ? event.downloadBytes : undefined,
            fullPackageBytes: typeof event.fullPackageBytes === 'number' ? event.fullPackageBytes : undefined,
            savedBytes: typeof event.savedBytes === 'number' ? event.savedBytes : undefined,
            installAction: event.installAction as UpdateStatusEvent['installAction'],
        })
    })
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
