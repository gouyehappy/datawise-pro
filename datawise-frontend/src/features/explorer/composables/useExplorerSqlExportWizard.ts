import {computed, ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {tableDetailApi} from '@/api'
import {findAncestorByType} from '@/core/utils/tree'
import {resolveExplorerSqlExportContext} from '@/features/explorer/services/table-sql-export.service'
import {resolveSqlClipboardExportMessageKey} from '@/features/explorer/services/table-sql-export.service'
import {
    applySqlExportWizardOutput,
    countTablesUnderDatabase,
    resolveSqlExportWizardMessageKey,
    runSqlExportWizard,
    type SqlExportWizardContext,
    type SqlExportWizardForm,
} from '@/features/explorer/services/sql-export-wizard.service'
import {isProductionEnvironment} from '@/features/connection/services/connection-environment.service'
import {resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'

export interface ExplorerSqlExportWizardDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    layout: ReturnType<typeof useLayoutStore>
    findConnectionLabel: (connectionId?: string) => string | undefined
    tableDetailApi: typeof tableDetailApi
}

export function useExplorerSqlExportWizard(deps: ExplorerSqlExportWizardDeps) {
    const {t, explorer, layout, findConnectionLabel, tableDetailApi: detailApi} = deps

    const showSqlExportWizard = ref(false)
    const sqlExportWizardContext = ref<SqlExportWizardContext | null>(null)
    const sqlExportWizardExporting = ref(false)
    const sqlExportWizardActionError = ref('')
    const sqlExportWizardMaxRowsDefault = computed(() => resolveClientMaxResultRows())
    const sqlExportWizardVariant = ref<'export' | 'backup'>('export')
    const sqlExportWizardIsProduction = ref(false)

    function openSqlExportWizard(node: TreeNode, variant: 'export' | 'backup' = 'export') {
        const ctx = resolveExplorerSqlExportContext(explorer.tree, node)
        if (!ctx) {
            layout.showErrorToast(t(resolveSqlClipboardExportMessageKey('contextMissing')))
            return
        }
        const connectionLabel = findConnectionLabel(ctx.connectionId)
        const connectionNode = findAncestorByType(explorer.tree, node.id, 'connection')
        sqlExportWizardVariant.value = variant
        sqlExportWizardIsProduction.value = isProductionEnvironment(
            connectionNode?.env,
            connectionNode?.envCustom,
        )
        sqlExportWizardActionError.value = ''
        if (node.type === 'table') {
            sqlExportWizardContext.value = {
                ...ctx,
                scope: 'table',
                connectionLabel,
            }
        } else {
            sqlExportWizardContext.value = {
                ...ctx,
                scope: 'database',
                connectionLabel,
                tableCount: countTablesUnderDatabase(explorer.tree, node.id),
            }
        }
        showSqlExportWizard.value = true
    }

    async function confirmSqlExportWizardExport(form: SqlExportWizardForm) {
        const ctx = sqlExportWizardContext.value
        if (!ctx) return
        sqlExportWizardExporting.value = true
        sqlExportWizardActionError.value = ''
        const isBackup = sqlExportWizardVariant.value === 'backup'
        const variant = isBackup ? 'backup' : 'export'
        try {
            const result = await runSqlExportWizard(ctx, form, detailApi)
            const outcome = await applySqlExportWizardOutput(result, form.output)
            if (outcome === 'empty') {
                sqlExportWizardActionError.value = t(resolveSqlExportWizardMessageKey(variant, 'failed'))
                return
            }
            showSqlExportWizard.value = false
            if (outcome === 'downloaded') {
                // startExport → 通知抽屉；复制结果已 silent。
                layout.startExport(result.fileName)
            }
        } catch {
            sqlExportWizardActionError.value = t(resolveSqlExportWizardMessageKey(variant, 'failed'))
        } finally {
            sqlExportWizardExporting.value = false
        }
    }

    return {
        showSqlExportWizard,
        sqlExportWizardContext,
        sqlExportWizardExporting,
        sqlExportWizardActionError,
        sqlExportWizardMaxRowsDefault,
        sqlExportWizardVariant,
        sqlExportWizardIsProduction,
        openSqlExportWizard,
        confirmSqlExportWizardExport,
    }
}
