import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadYarnWorkbench: LazyViewLoader = () => import('./components/tabs/YarnWorkbenchTab.vue')

const YARN_TAB_TYPES = [
    'yarn-applications',
    'yarn-nodes',
    'yarn-queues',
] as const satisfies readonly WorkspaceTabType[]

/** YARN workbench tabs — Feature Contract A-15 S2. KeepAlive: YarnWorkbenchTab. */
export const yarnFeature = defineFeature({
    id: 'workspace-yarn',
    contributes: {
        tabs: YARN_TAB_TYPES.map((type) => ({
            type,
            loader: loadYarnWorkbench,
            asyncName: 'YarnWorkbenchTab',
        })),
    },
})
