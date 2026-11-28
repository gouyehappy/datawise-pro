/** Desktop / about auto-update preference DTOs (shared so HTTP layer need not import features). */

export interface UpdatePreferences {
    notifyOnUpdate: boolean
    autoDownload: boolean
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
    notifyOnUpdate: true,
    // Opt-in download: compromised update feed must not auto-fetch installers.
    autoDownload: false,
}

export type UpdateChannel = 'none' | 'incremental' | 'full'

export type UpdateInstallAction = 'none' | 'reload' | 'restart' | 'installer'

export interface UpdateCheckResult {
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    downloadReady?: boolean
    downloading?: boolean
    error?: string
    /** incremental | full | none */
    updateChannel?: UpdateChannel | string
    /** frontend-dist / server-jar / installer primary label */
    updateKind?: string
    updateKinds?: string[]
    updateSummary?: string
    downloadBytes?: number
    fullPackageBytes?: number
    savedBytes?: number
    installAction?: UpdateInstallAction | string
    releaseNotes?: string
    /** True when the desktop host reused a recent automatic (hourly) cached check. */
    cached?: boolean
    checkedAt?: number
    nextCheckAt?: number
    checkIntervalMs?: number
}

export interface UpdateCheckOptions {
    /** Bypass the hourly auto-check throttle (manual About / menu button). */
    force?: boolean
}

export type UpdateStatusPhase =
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'applied'
    | 'error'
    | 'not-available'

export interface UpdateStatusEvent {
    phase: UpdateStatusPhase
    currentVersion: string
    latestVersion: string
    percent?: number
    error?: string
    activeKind?: string
    updateChannel?: UpdateChannel | string
    updateKind?: string
    updateKinds?: string[]
    updateSummary?: string
    downloadBytes?: number
    fullPackageBytes?: number
    savedBytes?: number
    installAction?: UpdateInstallAction | string
}

export interface UpdateInstallResult {
    ok: boolean
    restartRequired?: boolean
    channel?: string
    installAction?: string
    applied?: string[]
    error?: string
}

/** Format byte counts for about-panel copy (e.g. 12.3 MB). */
export function formatUpdateBytes(bytes?: number | null): string {
    if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
        return ''
    }
    const mb = bytes / (1024 * 1024)
    if (mb >= 100) return `${Math.round(mb)} MB`
    if (mb >= 10) return `${mb.toFixed(1)} MB`
    if (mb >= 1) return `${mb.toFixed(2)} MB`
    const kb = bytes / 1024
    return `${Math.max(1, Math.round(kb))} KB`
}
