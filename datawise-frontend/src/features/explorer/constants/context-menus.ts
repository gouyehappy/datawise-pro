import type {ContextMenuItem} from '@/core/types'
import type {ComposerTranslation} from 'vue-i18n'

export function getContextMenuForNodeType(type: string, t: ComposerTranslation): ContextMenuItem[] {
    const c = (key: string) => t(`explorer.context.${key}`)

    const tableMenu: ContextMenuItem[] = [
        {id: 'open', label: c('openTable'), icon: 'open', shortcut: 'F4'},
        {id: 'console', label: c('console'), icon: 'console', shortcut: 'Ctrl+Shift+L'},
        {id: 'pin', label: c('favoriteTable'), icon: 'pin'},
        {id: 'refresh', label: c('refresh'), icon: 'refresh'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'copy-name', label: c('copyName'), icon: 'copy'},
        {id: 'ddl', label: c('viewDdl'), icon: 'ddl'},
        {id: 'divider-2', label: '', divider: true},
        {
            id: 'copy-table',
            label: c('copyTable'),
            icon: 'table',
            children: [
                {id: 'copy-structure', label: c('copyStructure'), icon: 'table'},
                {id: 'copy-data', label: c('copyData'), icon: 'table'},
            ],
        },
        {id: 'truncate', label: c('truncate'), icon: 'truncate'},
        {id: 'edit', label: c('viewProperties'), icon: 'edit', shortcut: 'F6'},
        {id: 'divider-3', label: '', divider: true},
        {
            id: 'export-wizard',
            label: c('exportWizard'),
            icon: 'export',
        },
        {
            id: 'backup-wizard',
            label: c('backupWizard'),
            icon: 'export',
        },
        {
            id: 'export-sql',
            label: c('exportSql'),
            icon: 'export',
            children: [
                {id: 'export-structure', label: c('exportStructure'), icon: 'export'},
                {id: 'export-all', label: c('exportAll'), icon: 'export'},
            ],
        },
        {id: 'import', label: c('importData'), icon: 'import'},
        {id: 'migrate-data', label: c('migrateData'), icon: 'import'},
        {id: 'export-data', label: c('exportData'), icon: 'export'},
        {id: 'publish-to-kafka', label: c('publishToKafka'), icon: 'export'},
        {id: 'divider-4', label: '', divider: true},
        {id: 'delete', label: c('deleteTable'), icon: 'delete', shortcut: 'Delete', danger: true},
    ]

    const databaseMenu: ContextMenuItem[] = [
        {
            id: 'sql-editor',
            label: c('sqlEditor'),
            icon: 'console',
            children: [
                {id: 'sql-editor-open', label: c('sqlEditorOpen'), icon: 'console', shortcut: 'F3'},
                {id: 'sql-editor-recent', label: c('sqlEditorRecent'), icon: 'file', shortcut: 'Ctrl+Enter'},
                {id: 'sql-editor-new', label: c('sqlEditorNew'), icon: 'file', shortcut: 'Ctrl+]'},
                {id: 'sql-editor-console', label: c('sqlEditorConsole'), icon: 'console', shortcut: 'Ctrl+Alt+Enter'},
            ],
        },
        {id: 'run-sql-file', label: c('runSqlFile'), icon: 'file'},
        {id: 'restore-wizard', label: c('restoreWizard'), icon: 'import'},
        {
            id: 'export-wizard',
            label: c('exportWizard'),
            icon: 'export',
        },
        {
            id: 'backup-wizard',
            label: c('backupWizard'),
            icon: 'export',
        },
        {
            id: 'export-sql',
            label: c('exportSql'),
            icon: 'export',
            children: [
                {id: 'export-structure', label: c('exportStructure'), icon: 'export'},
                {id: 'export-all', label: c('exportAll'), icon: 'export'},
            ],
        },
        {id: 'export-metadoc', label: c('exportMetadoc'), icon: 'edit'},
        {id: 'schema-compare', label: c('schemaCompare'), icon: 'ddl'},
        {id: 'cross-env-compare', label: c('crossEnvCompare'), icon: 'table'},
        {id: 'migrate-data', label: c('migrateData'), icon: 'import'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'copy-name', label: c('copyName'), icon: 'copy'},
        {id: 'divider-2', label: '', divider: true},
        {id: 'delete-database', label: c('deleteDatabase'), icon: 'delete', shortcut: 'Delete', danger: true},
    ]

    const connectionMenu: ContextMenuItem[] = [
        {id: 'console', label: c('console'), icon: 'console', shortcut: 'Ctrl+Shift+L'},
        {id: 'create-database', label: c('createDatabase'), icon: 'file'},
        {id: 'create-schema', label: c('createSchema'), icon: 'file'},
        {id: 'edit', label: c('editConnection'), icon: 'edit', shortcut: 'F4'},
        {id: 'move', label: c('moveConnection'), icon: 'file'},
        {id: 'refresh', label: c('refresh'), icon: 'refresh'},
        {id: 'copy-name', label: c('copyName'), icon: 'copy'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'delete', label: c('deleteConnection'), icon: 'delete', shortcut: 'Delete', danger: true},
    ]

    const groupMenu: ContextMenuItem[] = [
        {id: 'new-subgroup', label: c('newSubgroup'), icon: 'file'},
        {
            id: 'add-connection',
            label: c('addConnection'),
            icon: 'connection',
            submenuPanel: 'db-type',
        },
        {id: 'divider-1', label: '', divider: true},
        {id: 'rename', label: c('renameGroup'), icon: 'edit'},
        {id: 'copy-name', label: c('copyName'), icon: 'copy'},
        {id: 'divider-2', label: '', divider: true},
        {id: 'delete', label: c('deleteGroup'), icon: 'delete', shortcut: 'Delete', danger: true},
    ]

    switch (type) {
        case 'table':
            return tableMenu
        case 'database':
            return databaseMenu
            case 'sql_file':
            return [
                {id: 'open', label: c('openSqlFile'), icon: 'open'},
                {id: 'script-history', label: c('scriptHistory'), icon: 'ddl'},
                {id: 'schedule-sql-file', label: c('scheduleSqlFile'), icon: 'console'},
                {id: 'divider-1', label: '', divider: true},
                {id: 'rename', label: c('renameSqlFile'), icon: 'edit'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
                {id: 'divider-2', label: '', divider: true},
                {id: 'delete-sql-file', label: c('deleteSqlFile'), icon: 'delete', shortcut: 'Delete', danger: true},
            ]
        case 'view_model':
            return [
                {id: 'open', label: c('openViewModelData'), icon: 'open', shortcut: 'F4'},
                {id: 'view-lineage', label: c('viewLineage'), icon: 'explain'},
                {id: 'edit-view-model', label: c('editViewModelSql'), icon: 'console'},
                {id: 'divider-1', label: '', divider: true},
                {id: 'rename', label: c('renameViewModel'), icon: 'edit'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
                {id: 'divider-2', label: '', divider: true},
                {id: 'migrate-data', label: c('migrateData'), icon: 'import'},
                {id: 'delete-view-model', label: c('deleteViewModel'), icon: 'delete', shortcut: 'Delete', danger: true},
            ]
        case 'folder-models':
            return [
                {id: 'new-view-model', label: c('newViewModel'), icon: 'file'},
                {id: 'divider-1', label: '', divider: true},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'folder-views':
            return [
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'folder-tables':
            return [
                {id: 'schema-er', label: c('schemaEr'), icon: 'table'},
                {id: 'schema-tables', label: c('schemaTables'), icon: 'edit'},
                {id: 'refresh', label: c('refresh'), icon: 'refresh'},
                {id: 'divider-1', label: '', divider: true},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'connection':
            return connectionMenu
        case 'redis-key':
            return [
                {id: 'open', label: c('openRedisKey'), icon: 'open', shortcut: 'F4'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'redis-browser':
            return [
                {id: 'open', label: c('openRedisBrowser'), icon: 'open', shortcut: 'F4'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'redis-feature':
            return [
                {id: 'open', label: c('openRedisFeature'), icon: 'open', shortcut: 'F4'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'elasticsearch-feature':
            return [
                {id: 'open', label: c('openRedisFeature'), icon: 'open', shortcut: 'F4'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'kafka-topic':
            return [
                {id: 'open', label: c('openKafkaTopic'), icon: 'open', shortcut: 'F4'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'kafka-feature':
            return [
                {id: 'open', label: c('openKafkaFeature'), icon: 'open', shortcut: 'F4'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'group':
            return groupMenu
        case 'project-docs':
            return [
                {id: 'new-project-file', label: c('newProjectFile'), icon: 'file'},
                {id: 'new-project-folder', label: c('newProjectFolder'), icon: 'folder'},
                {id: 'rename-project-file', label: c('renameProjectFile'), icon: 'edit'},
                {id: 'divider-1', label: '', divider: true},
                {id: 'refresh-project-files', label: c('refresh'), icon: 'refresh'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'project-scripts':
            return [
                {id: 'new-project-sql', label: c('newProjectSql'), icon: 'console'},
                {id: 'new-project-file', label: c('newProjectFile'), icon: 'file'},
                {id: 'new-project-folder', label: c('newProjectFolder'), icon: 'folder'},
                {id: 'rename-project-file', label: c('renameProjectFile'), icon: 'edit'},
                {id: 'divider-1', label: '', divider: true},
                {id: 'refresh-project-files', label: c('refresh'), icon: 'refresh'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        case 'project-file':
            return [
                {id: 'open', label: c('openProjectFile'), icon: 'open'},
                {id: 'rename-project-file', label: c('renameProjectFile'), icon: 'edit'},
                {id: 'copy-name', label: c('copyName'), icon: 'copy'},
            ]
        default:
            return [{id: 'copy-name', label: c('copyName'), icon: 'copy'}]
    }
}
