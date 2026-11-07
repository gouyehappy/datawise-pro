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
    type UpdateCheckResult,
    type UpdatePreferences,
    type UpdateStatusEvent,
} from '@/features/settings/services/about-settings.service'

export const useUpdateSettingsStore = defineStore('update-settings', () => {
    const preferences = ref<UpdatePreferences>(readStoredUpdatePreferences())
    const checking = ref(false)
    const downloading = ref(false)
    const downloadPercent = ref(0)
    const lastCheck = ref<UpdateCheckResult | null>(null)
    let statusUnsub: (() => void) | null = null

    void syncUpdaterPreferencesToDesktop(preferences.value)

    function ensureStatusSubscription() {
        if (statusUnsub) return
        statusUnsub = subscribeUpdaterStatus((event: UpdateStatusEvent) => {
            lastCheck.value = {
                currentVersion: event.currentVersion,
                latestVersion: event.latestVersion,
                hasUpdate: event.phase === 'available'
                    || event.phase === 'downloading'
                    || event.phase === 'downloaded',
                downloadReady: event.phase === 'downloaded',
                downloading: event.phase === 'downloading',
                error: event.error,
            }
            downloading.value = event.phase === 'downloading'
            if (typeof event.percent === 'number') {
                downloadPercent.value = event.percent
            }
            if (event.phase === 'downloaded') {
                downloadPercent.value = 100
            }
        })
    }

    function patchPreferences(patch: Partial<UpdatePreferences>) {
        preferences.value = {...preferences.value, ...patch}
        persistUpdatePreferences(preferences.value)
    }

    async function runUpdateCheck() {
        ensureStatusSubscription()
        checking.value = true
        try {
            lastCheck.value = await checkForUpdates()
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
            }
        }
    }

    async function runInstall() {
        return quitAndInstallUpdate()
    }

    return {
        preferences,
        checking,
        downloading,
        downloadPercent,
        lastCheck,
        patchPreferences,
        runUpdateCheck,
        runDownload,
        runInstall,
        ensureStatusSubscription,
    }
})
