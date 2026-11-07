import type {AiAnalysisResult, AiChatReplyPayload} from '@/features/ai/types/analysis'

export function buildAnalysisResult(
    result: Pick<
        AiChatReplyPayload,
        'sql' | 'columns' | 'rows' | 'chart' | 'report' | 'pythonInsight'
    >,
): AiAnalysisResult | undefined {
    if (!result.sql) return undefined
    return {
        sql: result.sql,
        columns: result.columns ?? [],
        rows: result.rows ?? [],
        chart: result.chart ?? null,
        report: result.report ?? null,
        pythonInsight: result.pythonInsight ?? null,
    }
}
