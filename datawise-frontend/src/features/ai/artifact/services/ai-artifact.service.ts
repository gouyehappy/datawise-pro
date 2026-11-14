/**
 * AI 结论资产化：把一次性洞察落成团队可复用的资产（P2-1）。
 *
 * 两条出口：
 * - `pinConclusionToDashboard`：有结果集的结论 → 看板卡片（带血缘与责任人）；
 * - `archiveConclusionToQueryLibrary`：有 SQL 的结论 → 查询库（SQL 头部写入血缘注释）。
 */
import {workspacePanelApi} from '@/api'
import type {TableColumn} from '@/core/types'
import type {DashboardChartWidget} from '@/features/dashboard/services/dashboard-chart-widget.service'
import {
    addDashboardChartWidget,
    createDashboardChartWidget,
} from '@/features/dashboard/services/dashboard-chart-widget.service'
import type {AiChatMessage} from '@/features/ai/types'
import type {AiAnalysisResult} from '@/features/ai/types/analysis'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {formatTargetLabel} from '@/features/ai/shared/utils/database-targets'
import type {QueryResultChartConfig} from '@/features/workspace/services/query-result-chart.service'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'

export const AI_ARCHIVE_FOLDER = 'AI 归档'
export const AI_ARCHIVE_TAGS = ['ai-conclusion', 'ai-archive'] as const

const TITLE_MAX = 48

export interface AiConclusionMeta {
    /** 会话标题，用于回链与 SQL 注释 */
    sessionTitle?: string
    /** 责任人（当前登录用户显示名） */
    owner?: string
    /** 本次提问的数据范围，构成血缘 */
    targets: AiDatabaseTarget[]
}

function analysisOf(message: AiChatMessage): AiAnalysisResult | null {
    return message.analysis ?? null
}

function firstMeaningfulLine(content: string): string {
    for (const raw of content.split('\n')) {
        const line = raw
            .replace(/^[#>\s*-]+/, '')
            .replace(/[*_`]/g, '')
            .trim()
        if (line) return line
    }
    return ''
}

function normalizeTitle(raw: string | null | undefined): string {
    const title = (raw ?? '').trim()
    if (!title) return ''
    return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX)}…` : title
}

/** 结论标题：优先模型给的图表标题，其次报告/正文首行 */
export function buildConclusionTitle(message: AiChatMessage): string {
    const analysis = analysisOf(message)
    const candidates = [
        analysis?.chart?.title,
        analysis?.report?.markdown,
        message.content,
    ]
    for (const candidate of candidates) {
        const title = normalizeTitle(candidate ? firstMeaningfulLine(candidate) : '')
        if (title) return title
    }
    return 'AI 结论'
}

/** 血缘：连接 / 库 / 表，最多列 3 张，其余折叠成 +N */
export function buildConclusionLineage(targets: AiDatabaseTarget[]): string {
    const labels = [...new Set(targets.map((target) => formatTargetLabel(target)).filter(Boolean))]
    if (!labels.length) return ''
    const head = labels.slice(0, 3).join('、')
    return labels.length > 3 ? `${head} 等 ${labels.length} 项` : head
}

function isNumericColumn(column: TableColumn): boolean {
    const type = (column.type ?? '').toLowerCase()
    if (!type) return false
    return /(int|decimal|numeric|float|double|real|number|money)/.test(type)
}

/**
 * 把分析结果映射成看板图表配置。
 * 模型给了 chart 就直接用；没给就按「首个维度 × 首个度量」兜底。
 */
export function conclusionChartConfig(
    analysis: AiAnalysisResult | null,
): QueryResultChartConfig | null {
    if (!analysis || !analysis.columns.length || !analysis.rows.length) return null
    if (analysis.chart) {
        return {
            chartType: analysis.chart.type,
            xField: analysis.chart.xField,
            yFields: [...analysis.chart.yFields],
            title: analysis.chart.title,
        }
    }
    const keyOf = (column: TableColumn) => column.key || column.name
    const dimension = analysis.columns.find((column) => !isNumericColumn(column))
    const measure = analysis.columns.find((column) => isNumericColumn(column))
    if (!dimension || !measure) return null
    return {
        chartType: 'bar',
        xField: keyOf(dimension),
        yFields: [keyOf(measure)],
        // 模型没给 chart 就没有标题可用，卡片标题由 buildConclusionTitle 兜底
        title: 'AI 结论',
    }
}

export function canPinConclusion(message: AiChatMessage): boolean {
    return conclusionChartConfig(analysisOf(message)) !== null
}

function resolveConclusionSql(message: AiChatMessage): string {
    const sql = analysisOf(message)?.sql?.trim()
    if (sql) return sql
    return ''
}

export function canArchiveConclusion(message: AiChatMessage): boolean {
    return resolveConclusionSql(message).length > 0
}

/** 看板卡片：结果集 + 血缘 + 责任人，落了就能再打开 */
export function pinConclusionToDashboard(
    message: AiChatMessage,
    meta: AiConclusionMeta,
): DashboardChartWidget | null {
    const analysis = analysisOf(message)
    const config = conclusionChartConfig(analysis)
    if (!analysis || !config) return null
    const lineage = buildConclusionLineage(meta.targets)
    const widget = createDashboardChartWidget({
        title: buildConclusionTitle(message),
        column: 'main',
        config,
        pivotEnabled: false,
        columns: analysis.columns,
        rows: analysis.rows,
    })
    const withSource: DashboardChartWidget = {
        ...widget,
        source: {
            lineage,
            owner: meta.owner,
            sessionTitle: meta.sessionTitle,
            createdAt: Date.now(),
        },
    }
    const appConfig = useAppConfigStore()
    appConfig.patchDashboardPreferences(
        addDashboardChartWidget(appConfig.dashboardPreferences, withSource),
    )
    return withSource
}

/** 查询库归档：SQL 头部写明来源会话、责任人、血缘与时间 */
export async function archiveConclusionToQueryLibrary(
    message: AiChatMessage,
    meta: AiConclusionMeta,
): Promise<string> {
    const sql = resolveConclusionSql(message)
    if (!sql) throw new Error('no-sql')
    const lineage = buildConclusionLineage(meta.targets)
    const header = [
        `-- AI 结论归档 · ${meta.sessionTitle?.trim() || 'AI 会话'}`,
        meta.owner ? `-- 责任人：${meta.owner}` : '',
        lineage ? `-- 血缘：${lineage}` : '',
        `-- 归档时间：${new Date().toISOString()}`,
    ].filter(Boolean)
    const name = buildConclusionTitle(message)
    await workspacePanelApi.saveConsole({
        name,
        connectionName: meta.targets[0]?.connectionLabel ?? 'AI',
        sql: `${header.join('\n')}\n\n${sql}`,
        folder: AI_ARCHIVE_FOLDER,
        tags: [...AI_ARCHIVE_TAGS],
    })
    // 让右侧「已保存」列表立刻看到这条归档
    void useShortcutPanelStore().load()
    return name
}
