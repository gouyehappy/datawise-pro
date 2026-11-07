import {defineStore} from 'pinia'
import {ref} from 'vue'
import {authApi} from '@/api'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useAppPalette} from '@/features/layout/composables/useAppPalette'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'

export const useLockScreenStore = defineStore('lock-screen', () => {
    const locked = ref(false)

    function lock() {
        const auth = useAuthStore()
        if (!auth.canLockScreen) {
            if (auth.isGuest) {
                useAppToast().warning(t('lockScreen.guestUnavailable'))
            } else {
                useAppToast().warning(t('lockScreen.passwordRequired'))
            }
            return false
        }
        useLayoutStore().closeProfileMenu()
        useAppPalette().closePalette()
        locked.value = true
        return true
    }

    function unlockLocal() {
        locked.value = false
    }

    async function unlockWithPassword(password: string): Promise<void> {
        await authApi.verifyPassword(password)
        locked.value = false
    }

    return {
        locked,
        lock,
        unlockLocal,
        unlockWithPassword,
    }
})
