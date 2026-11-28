import {defineStore} from 'pinia'
import {ref} from 'vue'
import {
    checkForUpdates,
    downloadUpdate,
    persistUpdatePreferences,
    quitAndInstallUpdate,
    readStoredUpdatePreferences,
    subscribeUpdaterStatus,
    syncUpdaterPreferencesToDesktop,
    type UpdateCheckOptions,
    type UpdateCheckResult,
    type UpdateInstallResult,
    type UpdatePreferences,
    type UpdateStatusEvent,
} from '@/features/settings/services/about-settings.service'

export const useUpdateSettingsStore = defineStore('update-settings', () => {
    const preferences = ref<UpdatePreferences>(readStoredUpdatePreferences())
    const checking = ref(false)
    const downloading = ref(false)
    const downloadPercent = ref(0)
    const activeKind = ref<string | null>(null)
    const lastCheck = ref<UpdateCheckResult | null>(null)
    let statusUnsub: (() => void) | null = null

    void syncUpdaterPreferencesToDesktop(preferences.value)

    function mergeStatus(event: UpdateStatusEvent) {
        const stillPending = event.phase === 'available'
            || event.phase === 'downloading'
            || event.phase === 'downloaded'
        lastCheck.value = {
            currentVersion: event.currentVersion,
            latestVersion: event.latestVersion,
            hasUpdate: stillPending,
            downloadReady: event.phase === 'downloaded',
            downloading: event.phase === 'downloading',
            error: event.error,
            updateChannel: stillPending
                ? (event.updateChannel ?? lastCheck.value?.updateChannel)
                : 'none',
            updateKind: event.updateKind ?? lastCheck.value?.updateKind,
            updateKinds: event.updateKinds ?? lastCheck.value?.updateKinds,
            updateSummary: event.updateSummary ?? lastCheck.value?.updateSummary,
            downloadBytes: event.downloadBytes ?? lastCheck.value?.downloadBytes,
            fullPackageBytes: event.fullPackageBytes ?? lastCheck.value?.fullPackageBytes,
            savedBytes: event.savedBytes ?? lastCheck.value?.savedBytes,
            installAction: stillPending
                ? (event.installAction ?? lastCheck.value?.installAction)
                : 'none',
            releaseNotes: lastCheck.value?.releaseNotes,
        }
        downloading.value = event.phase === 'downloading'
        activeKind.value = event.activeKind ?? null
        if (typeof event.percent === 'number') {
            downloadPercent.value = event.percent
        }
        if (event.phase === 'downloaded' || event.phase === 'applied') {
            downloadPercent.value = 100
        }
    }

    function ensureStatusSubscription() {
        if (statusUnsub) return
        statusUnsub = subscribeUpdaterStatus((event: UpdateStatusEvent) => {
            mergeStatus(event)
        })
    }

    function patchPreferences(patch: Partial<UpdatePreferences>) {
        preferences.value = {...preferences.value, ...patch}
        persistUpdatePreferences(preferences.value)
    }

    async function runUpdateCheck(options?: UpdateCheckOptions) {
        ensureStatusSubscription()
        checking.value = true
        try {
            lastCheck.value = await checkForUpdates(options)
            return lastCheck.value
        } finally {
            checking.value = false
        }
    }

    async function runDownload() {
        ensureStatusSubscription()
        downloading.value = true
        downloadPercent.value = 0
        try {
            lastCheck.value = await downloadUpdate()
            return lastCheck.value
        } finally {
            if (!lastCheck.value?.downloadReady) {
                downloading.value = Boolean(lastCheck.value?.downloading)
            } else {
                downloading.value = false
            }
        }
    }

    async function runInstall(): Promise<UpdateInstallResult> {
        return quitAndInstallUpdate()
    }

    return {
        preferences,
        checking,
        downloading,
        downloadPercent,
        activeKind,
        lastCheck,
        patchPreferences,
        runUpdateCheck,
        runDownload,
        runInstall,
        ensureStatusSubscription,
    }
})
