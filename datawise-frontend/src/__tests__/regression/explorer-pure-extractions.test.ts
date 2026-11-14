import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    normalizeRenameInput,
    resolveExplorerNodeOpenKind,
} from '@/features/explorer/services/explorer-node-open.service'
import {
    resolveExplorerFavoritesNavIntent,
    resolveExplorerNodeSelectIntent,
} from '@/features/explorer/services/explorer-node-select.service'
import {
    resolveGroupCatalogDialogPlan,
    resolveDeleteMenuUiPlan,
    resolveSqlFileMenuDialogPlan,
    resolveSshScriptMenuDialogPlan,
    resolveTableDangerConfirmPlan,
    resolveViewModelMenuDialogPlan,
} from '@/features/explorer/services/explorer-menu-dialog-plans.service'
import {
    buildCreateNamespaceWorkspaceArgs,
    buildSqlFileScheduleDraft,
    resolveEditConnectionFormPlan,
    resolveNewConnectionFormPlan,
} from '@/features/explorer/services/explorer-workspace-open-plans.service'
import {
    resolveExplorerDeleteShortcutUiPlan,
    resolveShortcutEditCommand,
    resolveShortcutOpenCommand,
} from '@/features/explorer/services/explorer-shortcut-commands.service'
import {resolveRenameSqlFilePlan} from '@/features/explorer/services/sql-script-naming'
import {resolveRenameViewModelPlan} from '@/features/explorer/services/view-model-naming'
import {buildViewModelExplorerInfo} from '@/features/explorer/services/explorer-node-info.service'
import {resolvePinToastMessageKey} from '@/features/explorer/services/explorer-pinned-sort.service'
import {
    mapDatabaseShortcutToSqlEditorAction,
    resolveDatabaseSqlEditorMenuAction,
} from '@/features/explorer/services/sql-editor-menu-actions'
import {VIEW_MODEL_TREE_META} from '@/features/explorer/services/view-model-tree.service'
import {
    EXPLORER_FAVORITES_GROUP_ID,
    EXPLORER_FAVORITES_VIEW_ALL_ID,
} from '@/features/explorer/services/explorer-favorites.constants'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {resolveViewModelMessageKey} from '@/features/explorer/services/view-model-messages'
import {resolveSshScriptRecordMessageKey} from '@/features/ssh/services/ssh-script-record-messages'

describe('buildViewModelExplorerInfo', () => {
    it('builds breadcrumb and includes sql comment when provided', () => {
        const withSql = buildViewModelExplorerInfo({
            title: 'vm1',
            sourceNodeId: 'n1',
            connectionLabel: 'conn',
            instanceLabel: 'db',
            sql: 'select 1',
        })
        assert.equal(withSql.kind, 'empty')
        assert.equal(withSql.title, 'vm1')
        assert.equal(withSql.sourceNodeId, 'n1')
        assert.equal(withSql.breadcrumb, 'conn / db')
        assert.equal(withSql.comment, 'select 1')
        assert.deepEqual(withSql.fields, [{key: 'nodeType', value: 'view_model'}])
        assert.deepEqual(withSql.listItems, [])

        const withoutSql = buildViewModelExplorerInfo({
            title: 'vm1',
            sourceNodeId: 'n1',
            instanceLabel: 'db',
        })
        assert.equal(withoutSql.breadcrumb, 'db')
        assert.equal('comment' in withoutSql, false)
    })
})

describe('resolvePinToastMessageKey', () => {
    it('maps table / connection / other pinnable types', () => {
        assert.equal(resolvePinToastMessageKey('table', true), 'explorer.tableFavorited')
        assert.equal(resolvePinToastMessageKey('table', false), 'explorer.tableUnfavorited')
        assert.equal(resolvePinToastMessageKey('connection', true), 'explorer.connectionPinned')
        assert.equal(resolvePinToastMessageKey('connection', false), 'explorer.connectionUnpinned')
        assert.equal(resolvePinToastMessageKey('database', true), 'explorer.databasePinned')
        assert.equal(resolvePinToastMessageKey('schema', false), 'explorer.databaseUnpinned')
    })
})

describe('resolveDatabaseSqlEditorMenuAction', () => {
    it('maps database sql-editor menu ids and ignores others', () => {
        assert.equal(resolveDatabaseSqlEditorMenuAction('sql-editor-open', 'database'), 'open-latest')
        assert.equal(resolveDatabaseSqlEditorMenuAction('sql-editor-recent', 'database'), 'show-recent')
        assert.equal(resolveDatabaseSqlEditorMenuAction('sql-editor-new', 'database'), 'create-new')
        assert.equal(resolveDatabaseSqlEditorMenuAction('sql-editor-console', 'database'), 'open-blank')
        assert.equal(resolveDatabaseSqlEditorMenuAction('console', 'database'), null)
        assert.equal(resolveDatabaseSqlEditorMenuAction('sql-editor-open', 'table'), null)
    })
})

describe('mapDatabaseShortcutToSqlEditorAction', () => {
    it('maps shortcut actions onto sql-editor intents', () => {
        assert.equal(mapDatabaseShortcutToSqlEditorAction('open'), 'open-latest')
        assert.equal(mapDatabaseShortcutToSqlEditorAction('recent'), 'show-recent')
        assert.equal(mapDatabaseShortcutToSqlEditorAction('new'), 'create-new')
        assert.equal(mapDatabaseShortcutToSqlEditorAction('console'), 'open-blank')
    })
})

describe('resolveExplorerNodeOpenKind', () => {
    it('routes node types to open kinds including draft view models', () => {
        assert.equal(resolveExplorerNodeOpenKind({type: 'table', label: 't'}), 'table-or-view')
        assert.equal(resolveExplorerNodeOpenKind({type: 'view', label: 'v'}), 'table-or-view')
        assert.equal(resolveExplorerNodeOpenKind({type: 'sql_file', label: 'a.sql'}), 'sql-file')
        assert.equal(
            resolveExplorerNodeOpenKind({type: 'view_model', label: 'vm', meta: VIEW_MODEL_TREE_META.draft}),
            'view-model-draft',
        )
        assert.equal(
            resolveExplorerNodeOpenKind({type: 'view_model', label: 'vm', meta: VIEW_MODEL_TREE_META.published}),
            'view-model-data',
        )
        assert.equal(resolveExplorerNodeOpenKind({type: 'platform_feature', label: 'ai'}), 'platform-feature')
        assert.equal(resolveExplorerNodeOpenKind({type: 'redis-key', label: 'k'}), 'redis-key')
        assert.equal(resolveExplorerNodeOpenKind({type: 'folder', label: 'tables'}), 'expand')
        assert.equal(resolveExplorerNodeOpenKind({type: 'project-docs', label: 'docs'}), 'expand')
        assert.equal(resolveExplorerNodeOpenKind({type: 'group', label: 'g'}), 'expand')
    })
})

describe('normalizeRenameInput', () => {
    it('returns trimmed title or null for blank/unchanged', () => {
        assert.equal(normalizeRenameInput('  next  ', 'old'), 'next')
        assert.equal(normalizeRenameInput('same', 'same'), null)
        assert.equal(normalizeRenameInput('   ', 'old'), null)
    })
})

describe('resolveExplorerNodeSelectIntent', () => {
    it('routes load-more, favorites, view-model, and default select', () => {
        assert.deepEqual(resolveExplorerNodeSelectIntent({type: 'load_more', id: 'more'}), {
            kind: 'load-more',
        })
        assert.deepEqual(
            resolveExplorerNodeSelectIntent({type: 'folder', id: EXPLORER_FAVORITES_VIEW_ALL_ID}),
            {kind: 'favorites-show-all'},
        )
        assert.deepEqual(
            resolveExplorerNodeSelectIntent({type: 'group', id: EXPLORER_FAVORITES_GROUP_ID}),
            {kind: 'favorites-select'},
        )
        assert.deepEqual(resolveExplorerNodeSelectIntent({type: 'view_model', id: 'vm1'}), {
            kind: 'select',
            sync: 'view-model',
        })
        assert.deepEqual(resolveExplorerNodeSelectIntent({type: 'table', id: 't1'}), {
            kind: 'select',
            sync: 'info',
        })
        assert.equal(
            resolveExplorerFavoritesNavIntent({id: EXPLORER_FAVORITES_VIEW_ALL_ID}),
            'show-all',
        )
        assert.equal(resolveExplorerFavoritesNavIntent({id: 'conn-1'}), null)
    })
})

describe('explorer message key helpers', () => {
    it('maps ssh / view-model / sql-file i18n keys', () => {
        assert.equal(resolveSshScriptRecordMessageKey('loadFailed'), 'ssh.scriptRecord.loadFailed')
        assert.equal(resolveSshScriptRecordMessageKey('deleteConfirm'), 'ssh.scriptRecord.deleteConfirm')
        assert.equal(resolveSshScriptRecordMessageKey('renameSuccess'), 'ssh.scriptRecord.renameSuccess')
        assert.equal(resolveViewModelMessageKey('loadFailed'), 'viewModel.loadFailed')
        assert.equal(resolveViewModelMessageKey('renamed'), 'viewModel.renamed')
        assert.equal(resolveViewModelMessageKey('deleteFailed'), 'viewModel.deleteFailed')
        assert.equal(resolveExplorerSqlFileMessageKey('deleteMessage'), 'explorer.deleteSqlFileMessage')
        assert.equal(resolveExplorerSqlFileMessageKey('renamed'), 'explorer.sqlFileRenamed')
        assert.equal(
            resolveExplorerSqlFileMessageKey('scheduleContextMissing'),
            'explorer.scheduleSqlFileContextMissing',
        )
    })

    it('maps catalog / feature i18n keys', () => {
        assert.equal(resolveExplorerCatalogMessageKey('permissionDenied'), 'auth.permissionDenied')
        assert.equal(resolveExplorerCatalogMessageKey('groupRenamed'), 'explorer.groupRenamed')
        assert.equal(resolveExplorerCatalogMessageKey('subgroupCreated'), 'explorer.subgroupCreated')
        assert.equal(resolveExplorerCatalogMessageKey('connectionMoved'), 'explorer.connectionMoved')
        assert.equal(
            resolveExplorerFeatureMessageKey('tableMigrationContextMissing'),
            'explorer.tableMigrationContextMissing',
        )
        assert.equal(
            resolveExplorerFeatureMessageKey('kafkaPublishContextMissing'),
            'explorer.kafkaTablePublish.contextMissing',
        )
        assert.equal(resolveExplorerFeatureMessageKey('metadocFailed'), 'explorer.metadocFailed')
        assert.equal(resolveExplorerFeatureMessageKey('metadocTabTitle'), 'workspace.metadoc.tabTitle')
        assert.equal(resolveExplorerFeatureMessageKey('refreshDone'), 'explorer.refreshDone')
        assert.equal(
            resolveExplorerFeatureMessageKey('createNamespaceAccessDenied'),
            'explorer.createNamespace.accessDenied',
        )
        assert.equal(resolveExplorerFeatureMessageKey('loadSqlFileFailed'), 'console.loadSqlFileFailed')
        assert.equal(resolveExplorerFeatureMessageKey('lineageMissingContext'), 'lineage.missingContext')
        assert.equal(
            resolveExplorerFeatureMessageKey('productionApprovalSubmitted'),
            'console.productionApproval.submitted',
        )
    })
})

describe('resolveShortcutOpenCommand / resolveShortcutEditCommand', () => {
    it('builds connection-form and table-properties workspace commands', () => {
        assert.deepEqual(
            resolveShortcutOpenCommand({type: 'connection', id: 'c1', label: 'Conn', dbType: 'mysql'}),
            {
                type: 'open-connection-form',
                dbType: 'mysql',
                connectionId: 'c1',
                connectionName: 'Conn',
            },
        )
        assert.deepEqual(
            resolveShortcutOpenCommand({type: 'table', id: 't1', label: 'users'}),
            {type: 'open-node'},
        )
        assert.deepEqual(
            resolveShortcutEditCommand({type: 'table', id: 't1', label: 'users'}),
            {type: 'open-table-properties'},
        )
        assert.deepEqual(
            resolveShortcutEditCommand({type: 'connection', id: 'c1', label: 'Conn', dbType: 'redis'}),
            {
                type: 'open-connection-form',
                dbType: 'redis',
                connectionId: 'c1',
                connectionName: 'Conn',
            },
        )
        assert.equal(resolveShortcutEditCommand({type: 'database', id: 'd1', label: 'db'}), null)
    })
})

describe('rename confirm plans', () => {
    it('resolveRenameSqlFilePlan validates stem and unchanged names', () => {
        assert.deepEqual(resolveRenameSqlFilePlan('', 'a.sql'), {ok: false, reason: 'invalid-name'})
        assert.deepEqual(resolveRenameSqlFilePlan('a', 'a.sql'), {ok: false, reason: 'unchanged'})
        assert.deepEqual(resolveRenameSqlFilePlan('b', 'a.sql'), {ok: true, newBaseName: 'b'})
    })

    it('resolveRenameViewModelPlan validates noop and invalid names', () => {
        assert.deepEqual(resolveRenameViewModelPlan('same', 'same'), {ok: false, reason: 'noop'})
        assert.deepEqual(resolveRenameViewModelPlan('---', 'old'), {ok: false, reason: 'invalid-name'})
        assert.deepEqual(resolveRenameViewModelPlan('  next.view.sql  ', 'old'), {
            ok: true,
            name: 'next',
        })
    })
})

describe('resolveExplorerDeleteShortcutUiPlan', () => {
    it('maps node types to delete dialog plans with message keys', () => {
        assert.deepEqual(resolveExplorerDeleteShortcutUiPlan('database'), {
            kind: 'delete-database',
            permissionAction: 'delete-database',
            requiresDdlCheck: true,
        })
        assert.deepEqual(resolveExplorerDeleteShortcutUiPlan('table'), {
            kind: 'delete-table',
            permissionAction: 'delete',
            messageKey: 'explorer.deleteTableMessage',
        })
        assert.deepEqual(resolveExplorerDeleteShortcutUiPlan('sql_file'), {
            kind: 'delete-sql-file',
            permissionAction: 'delete',
            messageKey: 'explorer.deleteSqlFileMessage',
        })
        assert.deepEqual(
            resolveExplorerDeleteShortcutUiPlan({
                type: 'project-file',
                id: 'project-file:proj_default:docs:a.md',
            }),
            {
                kind: 'delete-project-file',
                permissionAction: 'delete-project-file',
                messageKey: 'explorer.deleteProjectFileMessage',
                isDirectory: false,
            },
        )
        assert.deepEqual(
            resolveExplorerDeleteShortcutUiPlan({
                type: 'project-docs',
                id: 'project-file:proj_default:docs:folder',
            }),
            {
                kind: 'delete-project-file',
                permissionAction: 'delete-project-file',
                messageKey: 'explorer.deleteProjectFolderMessage',
                isDirectory: true,
            },
        )
        assert.deepEqual(resolveExplorerDeleteShortcutUiPlan('connection'), {
            kind: 'delete-catalog',
            permissionAction: 'delete',
        })
        assert.equal(resolveExplorerDeleteShortcutUiPlan('view_model'), null)
    })
})

describe('explorer menu dialog plans', () => {
    it('resolveTableDangerConfirmPlan returns truncate / delete message keys', () => {
        assert.deepEqual(resolveTableDangerConfirmPlan('truncate'), {
            type: 'truncate',
            messageKey: 'explorer.truncateTableMessage',
        })
        assert.deepEqual(resolveTableDangerConfirmPlan('delete'), {
            type: 'delete',
            messageKey: 'explorer.deleteTableMessage',
        })
    })

    it('resolveGroupCatalogDialogPlan / resolveSqlFileMenuDialogPlan open rename or delete', () => {
        assert.deepEqual(resolveGroupCatalogDialogPlan('new-subgroup', 'g'), {dialog: 'new-subgroup'})
        assert.deepEqual(resolveGroupCatalogDialogPlan('rename', 'g1'), {
            dialog: 'rename',
            defaultName: 'g1',
        })
        assert.deepEqual(resolveSqlFileMenuDialogPlan('rename', 'a.sql'), {
            dialog: 'rename',
            defaultName: 'a',
        })
        assert.deepEqual(resolveSqlFileMenuDialogPlan('delete', 'a.sql'), {
            dialog: 'delete',
            messageKey: 'explorer.deleteSqlFileMessage',
        })
        assert.equal(resolveSqlFileMenuDialogPlan('script-history', 'a.sql'), null)
    })

    it('resolveViewModelMenuDialogPlan / resolveSshScriptMenuDialogPlan open rename or delete', () => {
        assert.deepEqual(resolveViewModelMenuDialogPlan('rename', 'vm'), {
            dialog: 'rename',
            defaultName: 'vm',
        })
        assert.deepEqual(resolveViewModelMenuDialogPlan('delete', 'vm'), {
            dialog: 'delete',
            messageKey: 'viewModel.deleteMessage',
        })
        assert.equal(resolveViewModelMenuDialogPlan('edit', 'vm'), null)
        assert.deepEqual(resolveSshScriptMenuDialogPlan('rename-record', 'r1'), {
            dialog: 'rename-record',
            defaultName: 'r1',
        })
        assert.deepEqual(resolveSshScriptMenuDialogPlan('delete-record', 'r1'), {
            dialog: 'delete-record',
            messageKey: 'ssh.scriptRecord.deleteConfirm',
        })
        assert.equal(resolveSshScriptMenuDialogPlan('new-record', 'r1'), null)
    })

    it('resolveDeleteMenuUiPlan maps menu delete intents to dialog plans', () => {
        assert.deepEqual(resolveDeleteMenuUiPlan('delete-database', 'database'), {
            kind: 'delete-database',
            requiresDdlCheck: true,
        })
        assert.deepEqual(resolveDeleteMenuUiPlan('delete', 'table'), {
            kind: 'delete-table',
            type: 'delete',
            messageKey: 'explorer.deleteTableMessage',
        })
        assert.deepEqual(resolveDeleteMenuUiPlan('delete', 'group'), {kind: 'delete-catalog'})
        assert.equal(resolveDeleteMenuUiPlan('delete', 'sql_file'), null)
    })
})

describe('explorer workspace open plans', () => {
    it('builds connection-form / create-namespace / schedule draft payloads', () => {
        assert.deepEqual(resolveNewConnectionFormPlan('mysql', {type: 'group', id: 'g1'}), {
            dbType: 'mysql',
            options: {groupId: 'g1'},
        })
        assert.deepEqual(resolveNewConnectionFormPlan('pg', {type: 'connection', id: 'c1'}), {
            dbType: 'pg',
        })
        assert.deepEqual(
            resolveEditConnectionFormPlan({id: 'c1', label: 'Conn', dbType: 'redis'}),
            {dbType: 'redis', connectionId: 'c1', connectionName: 'Conn'},
        )
        assert.equal(resolveEditConnectionFormPlan({id: 'c1', label: 'Conn'}), null)
        assert.deepEqual(
            buildCreateNamespaceWorkspaceArgs('schema', {id: 'c1', label: 'Conn', dbType: 'pg'}),
            {
                connectionId: 'c1',
                connectionName: 'Conn',
                dbType: 'pg',
                mode: 'schema',
                hostLabel: 'Conn',
                explorerNodeId: 'c1',
            },
        )
        assert.deepEqual(buildSqlFileScheduleDraft('job.sql'), {
            name: 'Schedule job',
            source: 'workspace_file',
            sqlFile: 'job.sql',
            cronExpression: '0 0 * * *',
            enabled: true,
        })
    })
})
