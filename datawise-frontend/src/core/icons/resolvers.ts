import type {SettingsSection} from '@/core/types'
import type {WorkspaceTabType} from '@/core/types'
import type {DwIconName} from '@/core/icons/registry'
import type {SideRailItemId} from '@/shared/config/side-rail.types'
import type {ShortcutPanel} from '@/core/types'

export function settingsSectionDwIcon(section: SettingsSection): DwIconName {
    const map: Record<SettingsSection, DwIconName> = {
        basic: 'settings-basic',
        layout: 'settings-layout',
        connectionHealth: 'settings-connection-health',
        systemMetrics: 'settings-system-metrics',
        runtime: 'settings-plugins',
        profile: 'settings-profile',
        editor: 'settings-editor',
        querySafety: 'alert-triangle',
        sqlEditor: 'settings-sql-editor',
        sqlSnippets: 'settings-sql-editor',
        shortcuts: 'settings-shortcuts',
        plugins: 'settings-plugins',
        ai: 'settings-ai',
        dataAgent: 'settings-data-agent',
        knowledge: 'settings-knowledge',
        about: 'settings-about',
        integrations: 'link',
        mcp: 'code',
        secrets: 'key',
        userPermissions: 'key',
        tenants: 'users',
        projects: 'folder',
        backupCenter: 'folder',
        configPortability: 'export',
    }
    return map[section]
}

export function workspaceTabDwIcon(type: WorkspaceTabType): DwIconName {
    switch (type) {
        case 'welcome':
            return 'tab-welcome'
        case 'console':
            return 'tab-console'
        case 'table':
        case 'schema-tables':
        case 'metadoc':
            return 'tab-table'
        case 'connection':
            return 'tab-connection'
        case 'create-database':
            return 'tab-table'
        case 'terminal':
            return 'tab-terminal'
        case 'schema-compare':
            return 'tab-schema-compare'
        case 'schema-er':
            return 'tab-schema-er'
        case 'cross-env-compare':
            return 'tab-cross-env-compare'
        case 'view_model':
            return 'tab-view-model'
        case 'view_model_editor':
            return 'tab-view-model-editor'
        case 'view_model_lineage':
            return 'tab-view-model'
        case 'redis-key':
            return 'tab-redis-key'
        case 'redis-console':
            return 'tab-redis-console'
        case 'elasticsearch-console':
            return 'tab-console'
        case 'mongo-console':
            return 'tab-mongo-console'
        case 'kafka-topics':
        case 'kafka-topic':
        case 'kafka-consumer-groups':
        case 'kafka-table-publish':
            return 'tab-kafka'
        case 'yarn-applications':
        case 'yarn-nodes':
        case 'yarn-queues':
            return 'tab-yarn'
        case 'jenkins-jobs':
        case 'jenkins-nodes':
            return 'tab-jenkins'
        case 'nacos-configs':
            return 'settings'
        case 'polaris-services':
            return 'link'
        case 'platform_catalog':
            return 'ai'
        case 'data_catalog':
            return 'search'
        case 'local-text':
            return 'file'
        case 'community-plugin-center':
        case 'community-workbench':
        case 'community-filesystem':
            return 'plugins'
        default:
            return 'tab-file'
    }
}

const SHORTCUT_ICON_MAP: Record<string, DwIconName> = {
    search: 'search',
    refresh: 'refresh',
    locate: 'locate',
    settings: 'settings',
    run: 'run',
    save: 'save',
    console: 'console',
    ai: 'ai',
    bot: 'bot',
    'comment-column': 'comment-column',
    'comment-table': 'comment-table',
    'comment-all': 'comment-all',
    terminal: 'terminal',
    notify: 'notify',
    lock: 'lock',
}

export function shortcutActionDwIcon(iconName: string): DwIconName | null {
    return SHORTCUT_ICON_MAP[iconName] ?? null
}

export function sideRailDwIcon(id: SideRailItemId): DwIconName {
    const map: Record<SideRailItemId, DwIconName> = {
        database: 'database',
        dashboard: 'dashboard',
        ai: 'ai',
        packStore: 'layers',
        plugin: 'plugins',
        communityPlugin: 'plugins',
        connectorMarket: 'connectors',
        pluginDev: 'dev-tools',
        profile: 'user',
        team: 'users',
        settings: 'settings',
        refresh: 'refresh',
        notify: 'notify',
        assistant: 'bot',
        feedback: 'feedback',
        terminal: 'terminal',
    }
    return map[id]
}

export function shortcutRailDwIcon(id: ShortcutPanel): DwIconName {
    const map: Record<ShortcutPanel, DwIconName> = {
        info: 'about',
        history: 'history',
        monitor: 'monitor',
        console: 'tab-console',
        export: 'export',
        migration: 'migration',
    }
    return map[id]
}
