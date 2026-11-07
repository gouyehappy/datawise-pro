import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createPinia, setActivePinia} from 'pinia'
import {useExplorerRestoreWizard} from '@/features/explorer/composables/useExplorerRestoreWizard'
import {useExplorerSqlExportWizard} from '@/features/explorer/composables/useExplorerSqlExportWizard'
import type {ExplorerRestoreWizardDeps} from '@/features/explorer/composables/useExplorerRestoreWizard'
import type {ExplorerSqlExportWizardDeps} from '@/features/explorer/composables/useExplorerSqlExportWizard'

function restoreDeps(overrides: Partial<ExplorerRestoreWizardDeps> = {}): ExplorerRestoreWizardDeps {
    return {
        t: (key: string) => key,
        explorer: {tree: []} as unknown as ExplorerRestoreWizardDeps['explorer'],
        layout: {showErrorToast: () => undefined, showSuccessToast: () => undefined} as unknown as ExplorerRestoreWizardDeps['layout'],
        auth: {isGuest: false} as unknown as ExplorerRestoreWizardDeps['auth'],
        teamStore: {
            teams: [],
            submitProductionApproval: () => Promise.resolve(),
        } as unknown as ExplorerRestoreWizardDeps['teamStore'],
        findConnectionId: () => 'c1',
        findConnectionLabel: () => 'Conn',
        ...overrides,
    }
}

describe('explorer wizard composables', () => {
    it('restore wizard submits production approval for current context', async () => {
        let submitted = 0
        const teamStore = {
            teams: [],
            submitProductionApproval: () => {
                submitted += 1
                return Promise.resolve()
            },
        } as unknown as ExplorerRestoreWizardDeps['teamStore']
        const wizard = useExplorerRestoreWizard(restoreDeps({teamStore}))
        wizard.restoreWizardContext.value = {
            connectionId: 'c1',
            connectionLabel: 'Conn',
            database: 'app',
            env: 'prod',
            databaseNodeId: 'n1',
        } as never
        wizard.restoreWizardFileState.value = {
            fileName: 'backup.sql',
            sql: 'select 1',
            preflight: {statementCount: 1},
        } as never

        await wizard.submitRestoreWizardProductionApproval('team-1')
        assert.equal(submitted, 1)
    })

    it('sql export wizard exposes max rows default', () => {
        setActivePinia(createPinia())
        const wizard = useExplorerSqlExportWizard({
            t: (key: string) => key,
            explorer: {tree: []} as unknown as ExplorerSqlExportWizardDeps['explorer'],
            layout: {} as unknown as ExplorerSqlExportWizardDeps['layout'],
            findConnectionLabel: () => undefined,
            tableDetailApi: {} as never,
        })
        assert.equal(typeof wizard.sqlExportWizardMaxRowsDefault.value, 'number')
    })

    it('sql export confirm is a no-op without context', async () => {
        const wizard = useExplorerSqlExportWizard({
            t: (key: string) => key,
            explorer: {tree: []} as unknown as ExplorerSqlExportWizardDeps['explorer'],
            layout: {} as unknown as ExplorerSqlExportWizardDeps['layout'],
            findConnectionLabel: () => undefined,
            tableDetailApi: {} as never,
        })
        await wizard.confirmSqlExportWizardExport({} as never)
        assert.equal(wizard.sqlExportWizardExporting.value, false)
    })
})
