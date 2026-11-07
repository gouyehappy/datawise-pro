import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadElasticsearchConsole: LazyViewLoader = () =>
    import('./components/tabs/ElasticsearchConsoleTab.vue')

/** Elasticsearch console tab — Feature Contract A-15 S3. */
export const elasticsearchFeature = defineFeature({
    id: 'workspace-elasticsearch',
    contributes: {
        tabs: [
            {
                type: 'elasticsearch-console' as const satisfies WorkspaceTabType,
                loader: loadElasticsearchConsole,
            },
        ],
    },
})
