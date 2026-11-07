import {persistDesktopUiKeys} from '@/features/layout/services/desktop-ui-store'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {isPackagedRenderer} from '@/shared/api/desktop-renderer'
import {CORE_CONNECTOR_IDS} from '@/features/settings/services/runtime-format.service'

export const RUNTIME_SETUP_COMPLETED_KEY = 'dw-cli-runtime-setup-completed'

export {CORE_CONNECTOR_IDS}

export function isRuntimeSetupCompleted(storage: Storage = localStorage): boolean {
    return storage.getItem(RUNTIME_SETUP_COMPLETED_KEY) === '1'
}

export function markRuntimeSetupCompleted(storage: Storage = localStorage): void {
    storage.setItem(RUNTIME_SETUP_COMPLETED_KEY, '1')
    persistDesktopUiKeys({runtimeSetupCompleted: '1'})
}

export function clearRuntimeSetupCompleted(storage: Storage = localStorage): void {
    storage.removeItem(RUNTIME_SETUP_COMPLETED_KEY)
    persistDesktopUiKeys({runtimeSetupCompleted: null})
}

function isPackagedDesktop(): boolean {
    if (!isDesktopApp()) return false
    if (typeof window !== 'undefined' && window.datawise?.isPackaged === true) return true
    if (typeof window !== 'undefined' && window.datawise?.splash?.getMeta?.()?.isPackaged === true) {
        return true
    }
    return isPackagedRenderer()
}

/**
 * Show first-run runtime wizard only on packaged desktop for a fresh workspace
 * that has not completed (or skipped) the setup yet.
 */
export async function shouldShowRuntimeSetupWizard(
    storage: Storage = localStorage,
): Promise<boolean> {
    if (!isPackagedDesktop()) return false
    if (isRuntimeSetupCompleted(storage)) return false

    const config = window.datawise?.config
    if (!config?.getSettings) {
        // Packaged desktop without settings bridge — treat as eligible once.
        return true
    }
    try {
        const settings = await config.getSettings()
        return settings.runtimeSetupPending === true
    } catch {
        return false
    }
}

export async function clearRuntimeSetupPending(): Promise<void> {
    const config = window.datawise?.config
    if (!config?.clearRuntimeSetupPending) return
    try {
        await config.clearRuntimeSetupPending()
    } catch {
        // best-effort
    }
}

export async function completeRuntimeSetup(storage: Storage = localStorage): Promise<void> {
    markRuntimeSetupCompleted(storage)
    await clearRuntimeSetupPending()
}
