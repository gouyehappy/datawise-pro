import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadPlatformCatalog: LazyViewLoader = () =>
    import('./components/tabs/PlatformCatalogTab.vue')
const loadDataCatalog: LazyViewLoader = () => import('./components/tabs/DataCatalogTab.vue')

/** Platform / data catalog tabs — Feature Contract A-15-FULL. */
export const catalogFeature = defineFeature({
    id: 'workspace-catalog',
    contributes: {
        tabs: [
            {
                type: 'platform_catalog' as const satisfies WorkspaceTabType,
                loader: loadPlatformCatalog,
            },
            {
                type: 'data_catalog' as const satisfies WorkspaceTabType,
                loader: loadDataCatalog,
            },
        ],
    },
})
