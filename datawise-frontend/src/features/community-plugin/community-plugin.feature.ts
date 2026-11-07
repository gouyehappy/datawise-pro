import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadCommunityPluginCenter: LazyViewLoader = () =>
    import('@/features/community-plugin/components/CommunityPluginCenterTab.vue')
const loadCommunityWorkbench: LazyViewLoader = () =>
    import('@/features/community-plugin/components/CommunityWorkbenchTab.vue')
const loadCommunityFilesystem: LazyViewLoader = () =>
    import('@/features/community-plugin/components/CommunityFilesystemTab.vue')

/**
 * Community plugin feature (A-09 palette + A-10 navModules + A-15-FULL tabs).
 * NavModule `communityPlugin` opens the workspace center tab — no ModuleWorkbench page.
 * iframe workbench stays on persistent-iframe path in WorkspaceArea (not KeepAlive).
 */
export const communityPluginFeature = defineFeature({
    id: 'community-plugin',
    contributes: {
        palette: [
            {
                id: 'module:communityPlugin',
                labelKey: 'commandPalette.modules.communityPlugin',
                groupKey: 'commandPalette.groups.navigation',
                order: 80,
                action: {kind: 'setModule', module: 'communityPlugin'},
            },
        ],
        navModules: [
            {
                module: 'communityPlugin',
                kind: 'workspace-open',
                open: 'communityPluginCenter',
            },
        ],
        tabs: [
            {
                type: 'community-plugin-center' as const satisfies WorkspaceTabType,
                loader: loadCommunityPluginCenter,
            },
            {
                type: 'community-workbench' as const satisfies WorkspaceTabType,
                loader: loadCommunityWorkbench,
            },
            {
                type: 'community-filesystem' as const satisfies WorkspaceTabType,
                loader: loadCommunityFilesystem,
            },
        ],
    },
})
