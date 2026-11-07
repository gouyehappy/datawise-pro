import {configureDataGridHost} from '@/core/data-grid/data-grid-host'
import {applyPluginRenderGrid} from '@/features/plugin/services/plugin-hook.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {PackId} from '@/features/pack/types/pack.types'

let registered = false

/** Wire core DataGrid to feature-owned stores/hooks (call once from AppShell). */
export function registerDataGridHost(): void {
    if (registered) return
    registered = true

    configureDataGridHost({
        showWarningToast: (message) => useLayoutStore().showWarningToast(message),
        showSuccessToast: (message) => useLayoutStore().showSuccessToast(message),
        isPluginEnabled: (pluginId) => usePluginStore().isEnabled(pluginId),
        applyPluginRenderGrid,
        entitlement: {
            get mode() {
                return useEntitlementStore().mode
            },
            get suiteId() {
                return useEntitlementStore().suiteId
            },
            get watermarkFooter() {
                return useEntitlementStore().watermarkFooter
            },
            isPackUsable: (packId) => useEntitlementStore().isPackUsable(packId as PackId),
            openPaywall: (packId, reason) =>
                useEntitlementStore().openPaywall(packId as PackId, reason),
        },
    })
}
