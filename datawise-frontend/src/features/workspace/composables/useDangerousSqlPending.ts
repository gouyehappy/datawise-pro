import {ref} from 'vue'
import type {TableColumn, TableRow} from '@/core/types'
import {
    analyzeDangerousSql,
    readCountFromPreviewRows,
    type DangerousSqlPreview,
} from '@/features/workspace/services/dangerous-sql-preview.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export type DangerousSqlPreviewRunner = (
    sql: string,
) => Promise<{rows: TableRow[]; columns: TableColumn[]}>

export interface DangerousSqlPendingOptions {
    /** Return false to skip toolbar confirmation (e.g. whitelist on non-prod). */
    shouldConfirm?: (sql: string, preview: DangerousSqlPreview) => boolean
    /** Shown in pending bar when prod forces confirmation. */
    productionForced?: () => boolean
}

export function useDangerousSqlPending(
    runPreview: DangerousSqlPreviewRunner,
    options: DangerousSqlPendingOptions = {},
) {
    const pending = ref(false)
    const pendingSql = ref<string | null>(null)
    const preview = ref<DangerousSqlPreview | null>(null)
    const loading = ref(false)
    const affectedCount = ref<number | null>(null)
    const sampleRows = ref<TableRow[]>([])
    const sampleColumns = ref<TableColumn[]>([])
    const errorMessage = ref<string | null>(null)
    const productionForced = ref(false)

    function resetPreviewState() {
        preview.value = null
        loading.value = false
        affectedCount.value = null
        sampleRows.value = []
        sampleColumns.value = []
        errorMessage.value = null
        productionForced.value = false
    }

    function requiresConfirmation(sql: string): boolean {
        const analysis = analyzeDangerousSql(sql)
        if (!analysis) return false
        if (options.shouldConfirm && !options.shouldConfirm(sql, analysis)) {
            return false
        }
        return true
    }

    async function armPending(sql: string): Promise<boolean> {
        const trimmed = sql.trim()
        if (!trimmed || !requiresConfirmation(trimmed)) {
            return false
        }

        const analysis = analyzeDangerousSql(trimmed)
        if (!analysis) return false

        pending.value = true
        pendingSql.value = trimmed
        preview.value = analysis
        productionForced.value = options.productionForced?.() ?? false
        loading.value = Boolean(analysis.countSql)
        errorMessage.value = null
        affectedCount.value = null
        sampleRows.value = []
        sampleColumns.value = []

        if (analysis.countSql) {
            try {
                const countResult = await runPreview(analysis.countSql)
                affectedCount.value = readCountFromPreviewRows(countResult.rows)
                if (analysis.sampleSql) {
                    const sampleResult = await runPreview(analysis.sampleSql)
                    sampleRows.value = sampleResult.rows
                    sampleColumns.value = sampleResult.columns
                }
            } catch (error) {
                errorMessage.value = resolveCaughtApiErrorMessage(error, t, 'console.runFailed')
            } finally {
                loading.value = false
            }
        }

        return true
    }

    function disarm() {
        pending.value = false
        pendingSql.value = null
        resetPreviewState()
    }

    return {
        pending,
        pendingSql,
        preview,
        loading,
        affectedCount,
        sampleRows,
        sampleColumns,
        errorMessage,
        productionForced,
        requiresConfirmation,
        armPending,
        disarm,
    }
}
