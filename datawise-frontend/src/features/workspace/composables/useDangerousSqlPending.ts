import {ref} from 'vue'
import type {TableColumn, TableRow} from '@/core/types'
import {
    analyzeDangerousSql,
    readCountFromPreviewRows,
    type DangerousSqlPreview,
} from '@/features/workspace/services/dangerous-sql-preview.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

/** 非生产环境下，命中 WHERE 且影响行数不超过此值时视为低风险：预演后直接放行 */
export const DANGEROUS_SQL_LOW_RISK_MAX_ROWS = 200

export type DangerousSqlRisk = 'low' | 'high'

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
    const risk = ref<DangerousSqlRisk>('high')
    /** 上一次被预演自动放行的语句（供调用方提示影响行数） */
    const autoApprovedRows = ref<number | null>(null)

    function resetPreviewState() {
        preview.value = null
        loading.value = false
        affectedCount.value = null
        sampleRows.value = []
        sampleColumns.value = []
        errorMessage.value = null
        productionForced.value = false
        risk.value = 'high'
        autoApprovedRows.value = null
    }

    function requiresConfirmation(sql: string): boolean {
        const analysis = analyzeDangerousSql(sql)
        if (!analysis) return false
        if (options.shouldConfirm && !options.shouldConfirm(sql, analysis)) {
            return false
        }
        return true
    }

    /**
     * 风险判定：生产/无 WHERE/行数未知一律按高风险（继续拦），
     * 其余在有行数预览且低于阈值时判为低风险，执行前放行。
     */
    function resolveRisk(
        analysis: DangerousSqlPreview,
        rows: number | null,
        forced: boolean,
    ): DangerousSqlRisk {
        if (forced) return 'high'
        if (analysis.fullTableRisk) return 'high'
        if (rows == null) return 'high'
        return rows <= DANGEROUS_SQL_LOW_RISK_MAX_ROWS ? 'low' : 'high'
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

        risk.value = resolveRisk(analysis, affectedCount.value, productionForced.value)
        if (risk.value === 'low') {
            // 低风险：已经承担了预演查询的代价，就不再打断执行
            autoApprovedRows.value = affectedCount.value
            pending.value = false
            pendingSql.value = null
            preview.value = null
            loading.value = false
            return false
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
        risk,
        autoApprovedRows,
        requiresConfirmation,
        armPending,
        disarm,
    }
}
