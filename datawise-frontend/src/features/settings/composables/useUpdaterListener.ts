import {onMounted, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {subscribeUpdaterStatus} from '@/features/settings/services/about-settings.service'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

/** Desktop: toast on background updater events when notifyOnUpdate is enabled. */
export function useUpdaterListener() {
    const {t} = useI18n()
    const toast = useAppToast()
    const updateSettings = useUpdateSettingsStore()
    let stop: (() => void) | null = null
    let lastNotifiedKey: string | null = null

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
                toast.show(t('settings.about.updateAvailable', {version: event.latestVersion}))
                return
            }
            if (event.phase === 'downloaded') {
                const key = `ready:${event.latestVersion}`
                if (lastNotifiedKey === key) return
                lastNotifiedKey = key
                toast.show(t('settings.about.updateReady', {version: event.latestVersion}))
            }
        })
    })

    onUnmounted(() => {
        stop?.()
        stop = null
    })
}
