import {defineFeature} from '@/core/feature-contract'

/**
 * Host settings nav baseline items (A-15-FULL).
 * Group shells stay in SETTINGS_NAV_GROUPS; items merge via contributes.settings.
 */
export const settingsFeature = defineFeature({
    id: 'settings',
    contributes: {
        settings: [
            {id: 'basic', labelKey: 'settings.nav.basic', groupKey: 'settings.nav.groups.preferences', order: 10},
            {
                id: 'configPortability',
                labelKey: 'settings.nav.configPortability',
                groupKey: 'settings.nav.groups.preferences',
                order: 20,
            },
            {id: 'layout', labelKey: 'settings.nav.layout', groupKey: 'settings.nav.groups.preferences', order: 30},
            {
                id: 'shortcuts',
                labelKey: 'settings.nav.shortcuts',
                groupKey: 'settings.nav.groups.preferences',
                order: 40,
            },
            {id: 'editor', labelKey: 'settings.nav.editor', groupKey: 'settings.nav.groups.editor', order: 10},
            {
                id: 'querySafety',
                labelKey: 'settings.nav.querySafety',
                groupKey: 'settings.nav.groups.editor',
                order: 15,
            },
            {id: 'sqlEditor', labelKey: 'settings.nav.sqlEditor', groupKey: 'settings.nav.groups.editor', order: 20},
            {
                id: 'sqlSnippets',
                labelKey: 'settings.nav.sqlEditorSnippets',
                groupKey: 'settings.nav.groups.editor',
                order: 30,
            },
            {
                id: 'connectionHealth',
                labelKey: 'settings.nav.connectionHealth',
                groupKey: 'settings.nav.groups.database',
                order: 10,
            },
            {
                id: 'systemMetrics',
                labelKey: 'settings.nav.systemMetrics',
                groupKey: 'settings.nav.groups.database',
                order: 20,
            },
            {id: 'runtime', labelKey: 'settings.nav.runtime', groupKey: 'settings.nav.groups.database', order: 30},
            {id: 'projects', labelKey: 'settings.nav.projects', groupKey: 'settings.nav.groups.database', order: 40},
            {
                id: 'userPermissions',
                labelKey: 'settings.nav.userPermissions',
                groupKey: 'settings.nav.groups.security',
                adminOnly: true,
                order: 10,
            },
            {
                id: 'tenants',
                labelKey: 'settings.nav.tenants',
                groupKey: 'settings.nav.groups.security',
                adminOnly: true,
                multiOnly: true,
                order: 20,
            },
            {
                id: 'secrets',
                labelKey: 'settings.nav.secrets',
                groupKey: 'settings.nav.groups.security',
                adminOnly: true,
                order: 30,
            },
            {
                id: 'backupCenter',
                labelKey: 'settings.nav.backupCenter',
                groupKey: 'settings.nav.groups.security',
                adminOnly: true,
                order: 40,
            },
            {
                id: 'integrations',
                labelKey: 'settings.nav.integrations',
                groupKey: 'settings.nav.groups.security',
                adminOnly: true,
                order: 50,
            },
            {id: 'mcp', labelKey: 'settings.nav.mcp', groupKey: 'settings.nav.groups.security', order: 60},
            {id: 'profile', labelKey: 'settings.nav.profile', groupKey: 'settings.nav.groups.account', order: 10},
            {id: 'plugins', labelKey: 'settings.nav.plugins', groupKey: 'settings.nav.groups.account', order: 20},
            {id: 'about', labelKey: 'settings.nav.about', groupKey: 'settings.nav.groups.account', order: 30},
        ],
    },
})
