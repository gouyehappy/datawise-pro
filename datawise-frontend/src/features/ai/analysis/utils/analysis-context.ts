import type {AiChatMessage} from '@/features/ai/types/messages'

export interface AiAnalysisContextPayload {
    previousSql: string
    previousSummary?: string
    previousChartType?: string
}

/** 从会话消息中提取最近一轮分析结果，供追问时带给后端 */
export function buildAnalysisContextFromMessages(
    messages: AiChatMessage[],
): AiAnalysisContextPayload | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.role === 'assistant' && msg.analysis?.sql) {
            return {
                previousSql: msg.analysis.sql,
                previousSummary: msg.content?.trim() || undefined,
                previousChartType: msg.analysis.chart?.type,
            }
        }
    }
    return undefined
}
