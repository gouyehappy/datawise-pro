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

export interface UpdateCheckResult {
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    downloadReady?: boolean
    downloading?: boolean
    error?: string
}

export type UpdateStatusPhase = 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available'

export interface UpdateStatusEvent {
    phase: UpdateStatusPhase
    currentVersion: string
    latestVersion: string
    percent?: number
    error?: string
}
