import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

type TabEntry = {
    type: WorkspaceTabType
    loader: LazyViewLoader
    asyncName?: string
    timeout?: number
}

const SHELL_TABS: TabEntry[] = [
    {type: 'welcome', loader: () => import('./components/tabs/WelcomeTab.vue')},
    {type: 'console', loader: () => import('./components/tabs/SqlConsoleTab.vue')},
    {type: 'table', loader: () => import('./components/tabs/TableDetailTab.vue')},
    {
        type: 'connection',
        loader: () => import('./components/tabs/ConnectionFormTab.vue'),
        asyncName: 'ConnectionFormTab',
    },
    {type: 'terminal', loader: () => import('./components/tabs/TerminalTab.vue')},
    {
        type: 'create-database',
        loader: () => import('./components/tabs/CreateDatabaseTab.vue'),
        asyncName: 'CreateDatabaseTab',
    },
    {
        type: 'local-text',
        loader: () => import('./components/tabs/LocalTextTab.vue'),
        asyncName: 'LocalTextTab',
        // Fail to PanelLoadError sooner than the 60s default if the chunk hangs.
        timeout: 15_000,
    },
]

/** L0 workspace shell tabs — Feature Contract A-15-FULL. */
export const workspaceShellFeature = defineFeature({
    id: 'workspace-shell',
    contributes: {
        tabs: SHELL_TABS.map(({type, loader, asyncName, timeout}) => ({
            type,
            loader,
            asyncName,
            timeout,
        })),
    },
})
