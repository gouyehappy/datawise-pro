import {onMounted, onUnmounted} from 'vue'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {subscribeUpdaterStatus} from '@/features/settings/services/about-settings.service'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

/** Desktop: startup auto-check (≤1/hour) + notify when notifyOnUpdate is enabled. */
export function useUpdaterListener() {
    const toast = useAppToast()
    const updateSettings = useUpdateSettingsStore()
    let stop: (() => void) | null = null
    let lastNotifiedKey: string | null = null
    let startupTimer: ReturnType<typeof setTimeout> | null = null

    onMounted(() => {
        if (!isDesktopApp()) return
        updateSettings.ensureStatusSubscription()
        stop = subscribeUpdaterStatus((event) => {
            if (!updateSettings.preferences.notifyOnUpdate) return
            // Manual "Check for updates" handles its own toasts
            if (updateSettings.checking) return
            if (event.phase === 'available') {
                const key = `available:${event.latestVersion}`
                if (lastNotifiedKey === key) return
                lastNotifiedKey = key
                const sizeMb = event.downloadBytes
                    ? `${Math.max(1, Math.round(event.downloadBytes / (1024 * 1024)))} MB`
                    : ''
                toast.notify({
                    category: 'system',
                    titleKey: 'updateAvailable',
                    bodyKey: sizeMb ? 'updateAvailableIncremental' : 'updateAvailable',
                    params: {
                        version: event.latestVersion || '',
                        size: sizeMb,
                        saved: event.savedBytes
                            ? `${Math.max(1, Math.round(event.savedBytes / (1024 * 1024)))} MB`
                            : '',
                    },
                })
                return
            }
            if (event.phase === 'downloaded') {
                const key = `ready:${event.latestVersion}`
                if (lastNotifiedKey === key) return
                lastNotifiedKey = key
                toast.notify({
                    category: 'system',
                    titleKey: 'updateAvailable',
                    bodyKey: 'updateAvailable',
                    params: {version: event.latestVersion || ''},
                })
            }
        })

        // Automatic check: at most once per hour (host throttle). Manual buttons use force:true.
        startupTimer = setTimeout(() => {
            const prefs = updateSettings.preferences
            if (!prefs.notifyOnUpdate && !prefs.autoDownload) return
            void updateSettings.runUpdateCheck()
        }, 8_000)
    })

    onUnmounted(() => {
        stop?.()
        stop = null
        if (startupTimer != null) {
            clearTimeout(startupTimer)
            startupTimer = null
        }
    })
}
