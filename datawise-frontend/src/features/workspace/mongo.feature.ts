import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadMongoConsole: LazyViewLoader = () => import('./components/tabs/MongoConsoleTab.vue')

/** Mongo console tab — Feature Contract A-15 S3. */
export const mongoFeature = defineFeature({
    id: 'workspace-mongo',
    contributes: {
        tabs: [
            {
                type: 'mongo-console' as const satisfies WorkspaceTabType,
                loader: loadMongoConsole,
            },
        ],
    },
})
