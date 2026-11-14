import {defineFeature} from '@/core/feature-contract'

/**
 * Workbench NavModule pages + their command-palette entries (A-15 partial).
 * Shell slots (database/ai) and communityPlugin workspace-open stay in their own features.
 */
export const workbenchNavFeature = defineFeature({
    id: 'workbench-nav',
    contributes: {
        navModules: [
            {
                module: 'dashboard',
                kind: 'module-page',
                asyncName: 'DashboardView',
                loader: () => import('@/features/dashboard/DashboardView.vue'),
            },
            {
                module: 'packStore',
                kind: 'module-page',
                asyncName: 'PackStoreView',
                loader: () => import('@/features/pack/PackStoreView.vue'),
            },
            {
                module: 'plugin',
                kind: 'module-page',
                asyncName: 'PluginView',
                loader: () => import('@/features/plugin/PluginView.vue'),
            },
            {
                module: 'pluginDev',
                kind: 'module-page',
                asyncName: 'PluginDevToolsView',
                loader: () => import('@/features/plugin/PluginDevToolsView.vue'),
            },
            {
                module: 'connectorMarket',
                kind: 'module-page',
                asyncName: 'ConnectorMarketView',
                loader: () => import('@/features/plugin/ConnectorMarketView.vue'),
            },
            {
                module: 'team',
                kind: 'module-page',
                asyncName: 'TeamView',
                loader: () => import('@/features/team/TeamView.vue'),
            },
            {
                module: 'settings',
                kind: 'module-page',
                asyncName: 'SettingsView',
                loader: () => import('@/features/settings/SettingsView.vue'),
            },
        ],
        palette: [
            {
                id: 'module:dashboard',
                labelKey: 'commandPalette.modules.dashboard',
                groupKey: 'commandPalette.groups.navigation',
                order: 10,
                action: {kind: 'setModule', module: 'dashboard'},
            },
            {
                id: 'module:database',
                labelKey: 'commandPalette.modules.database',
                groupKey: 'commandPalette.groups.navigation',
                order: 20,
                action: {kind: 'setModule', module: 'database'},
            },
            // order 30: ai feature (A-16)
            {
                id: 'module:team',
                labelKey: 'commandPalette.modules.team',
                groupKey: 'commandPalette.groups.navigation',
                order: 40,
                action: {kind: 'setModule', module: 'team'},
            },
            {
                id: 'module:packStore',
                labelKey: 'commandPalette.modules.packStore',
                groupKey: 'commandPalette.groups.navigation',
                order: 50,
                action: {kind: 'setModule', module: 'packStore'},
            },
            {
                id: 'module:plugin',
                labelKey: 'commandPalette.modules.plugin',
                groupKey: 'commandPalette.groups.navigation',
                order: 60,
                action: {kind: 'setModule', module: 'plugin'},
            },
            {
                id: 'module:connectorMarket',
                labelKey: 'commandPalette.modules.connectorMarket',
                groupKey: 'commandPalette.groups.navigation',
                order: 70,
                action: {kind: 'setModule', module: 'connectorMarket'},
            },
            // order 80: community-plugin feature
            {
                id: 'module:pluginDev',
                labelKey: 'commandPalette.modules.pluginDev',
                groupKey: 'commandPalette.groups.navigation',
                order: 90,
                when: 'pluginDevVisible',
                action: {kind: 'setModule', module: 'pluginDev'},
            },
            {
                id: 'module:settings',
                labelKey: 'commandPalette.modules.settings',
                groupKey: 'commandPalette.groups.navigation',
                order: 100,
                action: {kind: 'setModule', module: 'settings'},
            },
        ],
    },
})
