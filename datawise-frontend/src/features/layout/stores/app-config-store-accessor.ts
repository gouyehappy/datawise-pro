/**
 * Runtime accessor for the app-config Pinia store without a static import.
 * Breaks the ESM cycle: layout.ts ⇄ app-config-store.ts.
 */
import {getActivePinia} from 'pinia'
import type {SettingsSection} from '@/core/types'
import type {RestorableNavModule} from '@/shared/config/app-config.types'
import type {WorkbenchMode} from '@/shared/config/workbench-mode'

export type AppConfigStoreApi = {
    canOpenSettingsSection: (section: SettingsSection) => boolean
    pickAccessibleModule: () => RestorableNavModule
    workbenchMode: WorkbenchMode
    softSetWorkbenchMode: (mode: WorkbenchMode) => void
    setWorkbenchMode: (mode: WorkbenchMode) => void
    showExplorerPanel: boolean
    setShowExplorerPanel: (visible: boolean) => void
}

type PiniaInternal = NonNullable<ReturnType<typeof getActivePinia>> & {
    _s: Map<string, unknown>
}

export function getAppConfigStore(): AppConfigStoreApi {
    const pinia = getActivePinia() as PiniaInternal | undefined
    const store = pinia?._s.get('app-config') as AppConfigStoreApi | undefined
    if (!store) {
        throw new Error('app-config store is not registered')
    }
    return store
}
