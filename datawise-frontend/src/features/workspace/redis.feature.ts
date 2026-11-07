import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadRedisKey: LazyViewLoader = () => import('./components/tabs/RedisKeyTab.vue')
const loadRedisConsole: LazyViewLoader = () => import('./components/tabs/RedisConsoleTab.vue')

const REDIS_TABS = [
    {type: 'redis-key' as const satisfies WorkspaceTabType, loader: loadRedisKey},
    {type: 'redis-console' as const satisfies WorkspaceTabType, loader: loadRedisConsole},
]

/** Redis key / console tabs — Feature Contract A-15 S3. */
export const redisFeature = defineFeature({
    id: 'workspace-redis',
    contributes: {
        tabs: REDIS_TABS.map(({type, loader}) => ({type, loader})),
    },
})
