import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadConfigCenterWorkbench: LazyViewLoader = () =>
    import('./components/tabs/ConfigCenterWorkbenchTab.vue')

const CONFIG_CENTER_TAB_TYPES = [
    'nacos-configs',
    'nacos-services',
    'polaris-configs',
    'polaris-services',
] as const satisfies readonly WorkspaceTabType[]

/**
 * Config Center (Nacos / Polaris) workbench tabs — Feature Contract tabs pilot (A-15 S1).
 * KeepAlive name must stay ConfigCenterWorkbenchTab.
 */
export const configCenterFeature = defineFeature({
    id: 'workspace-config-center',
    contributes: {
        tabs: CONFIG_CENTER_TAB_TYPES.map((type) => ({
            type,
            loader: loadConfigCenterWorkbench,
            asyncName: 'ConfigCenterWorkbenchTab',
        })),
    },
})
