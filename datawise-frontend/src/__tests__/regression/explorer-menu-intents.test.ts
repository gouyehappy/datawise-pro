import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isOpenMenuAction,
    isPinMenuAction,
    isRestoreWizardMenuAction,
    isSqlExportClipboardMenuAction,
    isTablesFolderNode,
    listSshScriptRecordTabIds,
    resolveConnectionLifecycleMenuAction,
    resolveConnectionLifecycleToast,
    resolveConsoleMenuTarget,
    resolveCreateNamespaceMenuMode,
    resolveDatabaseCompareMenuAction,
    resolveExplorerDeleteShortcutIntent,
    resolveGroupCatalogDialogIntent,
    resolveMigrateDataMenuTarget,
    resolveSqlExportWizardMenuVariant,
    resolveSqlFileMenuIntent,
    resolveSshScriptMenuIntent,
    resolveTableDangerDialogMessageKey,
    resolveTableOpenViewMenuAction,
    resolveTablesFolderViewAction,
    resolveTablesFolderViewContextMissingKey,
    resolveViewModelMenuIntent,
} from '@/features/explorer/services/explorer-menu-intents.service'

describe('explorer-menu-intents.service', () => {
    it('detects tables folder and view actions', () => {
        assert.equal(isTablesFolderNode({type: 'folder', label: 'tables'}), true)
        assert.equal(isTablesFolderNode({type: 'folder', label: 'views'}), false)
        assert.equal(
            resolveTablesFolderViewAction('schema-er', {type: 'folder', label: 'tables'}),
            'schema-er',
        )
        assert.equal(
            resolveTablesFolderViewAction('schema-tables', {type: 'folder', label: 'tables'}),
            'schema-tables',
        )
        assert.equal(
            resolveTablesFolderViewAction('schema-er', {type: 'folder', label: 'views'}),
            null,
        )
        assert.equal(
            resolveTablesFolderViewContextMissingKey('schema-er'),
            'explorer.schemaErContextMissing',
        )
        assert.equal(
            resolveTablesFolderViewContextMissingKey('schema-tables'),
            'explorer.schemaTablesContextMissing',
        )
    })

    it('resolves export / restore wizard menu variants', () => {
        assert.equal(resolveSqlExportWizardMenuVariant('export-wizard', 'table'), 'export')
        assert.equal(resolveSqlExportWizardMenuVariant('backup-wizard', 'database'), 'backup')
        assert.equal(resolveSqlExportWizardMenuVariant('export-wizard', 'connection'), null)
        assert.equal(isRestoreWizardMenuAction('restore-wizard', 'database'), true)
        assert.equal(isRestoreWizardMenuAction('restore-wizard', 'table'), false)
    })

    it('resolves connection lifecycle and sql export clipboard actions', () => {
        assert.equal(resolveConnectionLifecycleMenuAction('connect', 'connection'), 'connect')
        assert.equal(resolveConnectionLifecycleMenuAction('disconnect', 'connection'), 'disconnect')
        assert.equal(resolveConnectionLifecycleMenuAction('reconnect', 'table'), null)
        assert.deepEqual(resolveConnectionLifecycleToast('connect', true), {
            key: 'explorer.connectionOpened',
            tone: 'success',
        })
        assert.equal(resolveConnectionLifecycleToast('connect', false), null)
        assert.deepEqual(resolveConnectionLifecycleToast('disconnect', false), {
            key: 'explorer.connectionDisconnectFailed',
            tone: 'error',
        })
        assert.deepEqual(resolveConnectionLifecycleToast('reconnect', true), {
            key: 'explorer.connectionReconnected',
            tone: 'success',
        })
        assert.equal(isSqlExportClipboardMenuAction('export-structure'), true)
        assert.equal(isSqlExportClipboardMenuAction('copy-data'), true)
        assert.equal(isSqlExportClipboardMenuAction('export-wizard'), false)
        assert.equal(isOpenMenuAction('open'), true)
        assert.equal(isOpenMenuAction('pin'), false)
        assert.equal(isPinMenuAction('pin', {type: 'table'}), true)
        assert.equal(isPinMenuAction('pin', {type: 'folder'}), false)
        assert.equal(isPinMenuAction('open', {type: 'table'}), false)
    })

    it('maps table danger message keys and delete shortcut intents', () => {
        assert.equal(
            resolveTableDangerDialogMessageKey('truncate'),
            'explorer.truncateTableMessage',
        )
        assert.equal(
            resolveTableDangerDialogMessageKey('delete'),
            'explorer.deleteTableMessage',
        )
        assert.deepEqual(resolveExplorerDeleteShortcutIntent('database'), {
            kind: 'delete-database',
            permissionAction: 'delete-database',
        })
        assert.deepEqual(resolveExplorerDeleteShortcutIntent('table'), {
            kind: 'delete-table',
            permissionAction: 'delete',
        })
        assert.deepEqual(resolveExplorerDeleteShortcutIntent('sql_file'), {
            kind: 'delete-sql-file',
            permissionAction: 'delete',
        })
        assert.deepEqual(resolveExplorerDeleteShortcutIntent('group'), {
            kind: 'delete-catalog',
            permissionAction: 'delete',
        })
        assert.equal(resolveExplorerDeleteShortcutIntent('view_model'), null)
    })

    it('resolves group / sql-file / view-model / ssh script intents', () => {
        assert.equal(resolveGroupCatalogDialogIntent('new-subgroup', 'group'), 'new-subgroup')
        assert.equal(resolveGroupCatalogDialogIntent('rename', 'group'), 'rename')
        assert.equal(resolveSqlFileMenuIntent('schedule-sql-file', 'sql_file'), 'schedule')
        assert.equal(resolveSqlFileMenuIntent('rename', 'table'), null)
        assert.equal(
            resolveViewModelMenuIntent('new-view-model', {type: 'folder', label: 'models'}),
            'new',
        )
        assert.equal(
            resolveViewModelMenuIntent('view-lineage', {type: 'view_model', label: 'vm'}),
            'lineage',
        )
        assert.equal(resolveSshScriptMenuIntent('new-ssh-script-record', 'ssh-script-records'), 'new-record')
        assert.equal(resolveSshScriptMenuIntent('rename-ssh-script-record', 'ssh-script-record'), 'rename-record')
    })

    it('resolves table view / compare / migrate / console / create-namespace intents', () => {
        assert.equal(resolveTableOpenViewMenuAction('ddl', 'table'), 'ddl')
        assert.equal(resolveTableOpenViewMenuAction('edit', 'table'), 'properties')
        assert.equal(resolveDatabaseCompareMenuAction('cross-env-compare', 'database'), 'cross-env-compare')
        assert.equal(resolveMigrateDataMenuTarget('migrate-data', 'table'), 'table-or-database')
        assert.equal(resolveMigrateDataMenuTarget('migrate-data', 'view_model'), 'view-model')
        assert.equal(resolveConsoleMenuTarget('console', 'database'), 'database')
        assert.equal(resolveConsoleMenuTarget('console', 'group'), 'generic')
        assert.equal(resolveCreateNamespaceMenuMode('create-schema', 'connection'), 'schema')
        assert.equal(resolveCreateNamespaceMenuMode('create-database', 'database'), null)
    })

    it('lists ssh script record tab ids to close', () => {
        assert.deepEqual(
            listSshScriptRecordTabIds(
                [
                    {id: 't1', type: 'ssh-script-record', connectionId: 'c1', sshScriptRecordId: 'r1'},
                    {id: 't2', type: 'ssh-script-record', connectionId: 'c1', sshScriptRecordId: 'r2'},
                    {id: 't3', type: 'console', connectionId: 'c1'},
                ],
                'c1',
                'r1',
            ),
            ['t1'],
        )
    })
})
