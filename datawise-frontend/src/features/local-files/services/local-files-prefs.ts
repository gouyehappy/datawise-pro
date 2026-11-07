import type {LocalFilesPreferences} from '@/shared/config/app-config.types'
import {
    normalizeLocalFiles,
    readAppConfig,
} from '@/shared/config/app-config.service'
import {DEFAULT_LOCAL_FILES_PREFERENCES} from '@/shared/config/app-config.defaults'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const LEGACY_RECENT_ROOTS_KEY = 'dw-cli-local-files-recent-roots'
const LEGACY_LAST_ROOT_KEY = 'dw-cli-local-files-last-root'
const LEGACY_FAVORITE_ROOTS_KEY = 'dw-cli-local-files-favorite-roots'

function readLegacyLocalStoragePrefs(): Partial<LocalFilesPreferences> | null {
    try {
        const recentRaw = localStorage.getItem(LEGACY_RECENT_ROOTS_KEY)
        const favoriteRaw = localStorage.getItem(LEGACY_FAVORITE_ROOTS_KEY)
        const lastRoot = localStorage.getItem(LEGACY_LAST_ROOT_KEY)?.trim() || null
        if (!recentRaw && !favoriteRaw && !lastRoot) return null
        const recentRoots = recentRaw ? (JSON.parse(recentRaw) as unknown) : []
        const favoriteRoots = favoriteRaw ? (JSON.parse(favoriteRaw) as unknown) : []
        return {
            lastRoot,
            recentRoots: Array.isArray(recentRoots)
                ? recentRoots.filter((item): item is string => typeof item === 'string')
                : [],
            favoriteRoots: Array.isArray(favoriteRoots)
                ? favoriteRoots.filter((item): item is string => typeof item === 'string')
                : [],
        }
    } catch {
        return null
    }
}

function clearLegacyLocalStoragePrefs() {
    try {
        localStorage.removeItem(LEGACY_RECENT_ROOTS_KEY)
        localStorage.removeItem(LEGACY_LAST_ROOT_KEY)
        localStorage.removeItem(LEGACY_FAVORITE_ROOTS_KEY)
    } catch {
        /* ignore */
    }
}

function readFromAppConfig(): LocalFilesPreferences {
    try {
        const store = useAppConfigStore()
        if (store.config?.localFiles) {
            return normalizeLocalFiles(store.config.localFiles)
        }
    } catch {
        /* pinia not ready — fall through */
    }
    return normalizeLocalFiles(readAppConfig().localFiles)
}

/** Read local-files folder history from app-config (migrates legacy localStorage once). */
export function readLocalFilesPreferences(): LocalFilesPreferences {
    const fromConfig = readFromAppConfig()
    const hasConfigData = Boolean(
        fromConfig.lastRoot
        || fromConfig.recentRoots.length
        || fromConfig.favoriteRoots.length,
    )
    if (hasConfigData) return fromConfig

    const legacy = readLegacyLocalStoragePrefs()
    if (!legacy) {
        return {...DEFAULT_LOCAL_FILES_PREFERENCES, recentRoots: [], favoriteRoots: []}
    }

    const migrated = normalizeLocalFiles(legacy)
    writeLocalFilesPreferences(migrated)
    clearLegacyLocalStoragePrefs()
    return migrated
}

/** Persist local-files folder history (local-files.json via app-config store). */
export function writeLocalFilesPreferences(prefs: LocalFilesPreferences) {
    const normalized = normalizeLocalFiles(prefs)
    try {
        useAppConfigStore().setLocalFilesPreferences(normalized)
    } catch {
        /* pinia not ready — skip; next successful write will persist */
    }
}
